import { Game, type Color, type PlayedMove } from '$lib/game.svelte';
import { engine } from '$lib/engine/engine';
import { follow, loadOpening } from '$lib/openings/tree';
import { pickMove, temperatureFor } from '$lib/openings/sampling';
import {
	resolvePinnedMove,
	isOnPinnedLine,
	isPinnedLineComplete,
	mainLinePath
} from '$lib/openings/pinning';
import type { BookNode, NodeEval, OpeningTree, OpeningVariation } from '$lib/openings/types';
import { terminalEval } from '$lib/terminal';
import { bookShare, bookVerdict } from './book-verdict';
import { precomputedEvals, toEvalScore } from './precomputed-grade';
import { classifyMove, formatEval, toSideCp, type MoveQuality } from './classify';
import { explainMove, type Explanation } from './explain';
import { chooseHint } from './hint';
import type { EvalScore } from '$lib/engine/uci';
import { Chess } from 'chess.js';

export type TrainerPhase = 'idle' | 'userTurn' | 'botThinking' | 'gameOver';

/** Time budget per engine probe when validating a hint (two probes worst case). */
const HINT_MOVETIME_MS = 400;

export type FeedbackBadge = MoveQuality | 'book-best' | 'book' | 'trap' | 'pending';

/** Human-readable label for each feedback badge (move list tooltips, feedback pill). */
export const BADGE_LABEL: Record<FeedbackBadge, string> = {
	'book-best': 'Book · main',
	book: 'Book',
	trap: 'Trap!',
	best: 'Best',
	excellent: 'Excellent',
	good: 'Good',
	inaccuracy: 'Inaccuracy',
	mistake: 'Mistake',
	blunder: 'Blunder',
	pending: 'Evaluating…'
};

export interface FeedbackItem {
	/** Ply index of the user move in game history. */
	ply: number;
	/** Preformatted move-number label, e.g. "12." or "12…". */
	label: string;
	san: string;
	badge: FeedbackBadge;
	detail?: string;
	retriable?: boolean;
	/** Why the move was bad (missed best move, opponent's punish line); flagged moves only. */
	explain?: Explanation;
}

export interface Hint {
	uci: string;
	source: 'book' | 'engine';
	/** Set when a book move existed but graded too poorly to recommend. */
	bookRejected?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Trainer {
	game = new Game();

	opening = $state<OpeningTree | null>(null);
	/** Train playing the opening yourself, or refuting it (bot plays it). */
	mode = $state<'play' | 'refute'>('refute');
	/** Side choice for free play (no opening selected). */
	manualSide = $state<Color>('white');
	/** Set when practicing a position from game review; overrides opening/book. */
	practice = $state<{ fen: string; label: string; moves?: PlayedMove[] } | null>(null);
	elo = $state(1600);
	/** 0 = always the most popular book move; 1 = wide sampling. */
	variability = $state(0.4);
	/** Show passive suggestions (fork panel, branch arrows). Off = drill blind;
	 * the pull-based Hint button is unaffected. */
	showSuggestions = $state(true);
	/** Pinned sub-line: while the game is on this UCI prefix the bot follows it
	 * deterministically (ignoring variability); null means normal sampling. */
	pinnedLine = $state<string[] | null>(null);
	/** Human name of the pinned line, for status display (null for ad-hoc reroutes). */
	pinnedName = $state<string | null>(null);
	/** True while the bot is still following its opening book. */
	inBook = $state(true);
	/** True once the game reached the end of a book line (a leaf node), as opposed
	 * to deviating from it — distinguishes "line complete" from "out of book". */
	bookExhausted = $state(false);
	phase = $state<TrainerPhase>('idle');
	feedback = $state<FeedbackItem[]>([]);
	hint = $state<Hint | null>(null);
	hintLoading = $state(false);

	userSide = $derived.by<Color>(() => {
		// Practicing a position: the user retries the move that was to play.
		if (this.practice) return this.practice.fen.split(' ')[1] === 'b' ? 'black' : 'white';
		if (!this.opening) return this.manualSide;
		const openingSide = this.opening.side;
		const otherSide: Color = openingSide === 'white' ? 'black' : 'white';
		return this.mode === 'play' ? openingSide : otherSide;
	});
	botSide = $derived<Color>(this.userSide === 'white' ? 'black' : 'white');
	/** True when a line is pinned and the game is still on it. */
	onPinnedLine = $derived(isOnPinnedLine(this.pinnedLine, this.game.uciMoves));
	/** True when the pinned line was played to its end (not diverged from). */
	pinnedComplete = $derived(isPinnedLineComplete(this.pinnedLine, this.game.uciMoves));
	lastFeedback = $derived(this.feedback.at(-1) ?? null);
	canTakeBack = $derived.by(() => {
		if (this.phase !== 'userTurn' && this.phase !== 'gameOver') return false;
		return this.lastUserPly() >= 0;
	});
	/** Emphasize the takeback as "Undo & retry" when the last move was flagged. */
	retrySuggested = $derived(this.canTakeBack && this.lastFeedback?.retriable === true);

	/** Incremented on every new game; stale async work checks it and bails. */
	private session = 0;

	async selectOpening(id: string | null): Promise<void> {
		// A pinned UCI path from another opening is meaningless here — drop it.
		this.clearPin();
		this.opening = id ? await loadOpening(id) : null;
	}

	/** Pin a named variation: the bot follows its UCI path deterministically. */
	pinVariation(v: OpeningVariation): void {
		this.pinnedLine = v.uci;
		this.pinnedName = v.name;
	}

	/** Reroute at the current fork: pin one more ply, then let sampling resume. */
	pinNextMove(uci: string): void {
		this.pinnedLine = [...this.game.uciMoves, uci];
		this.pinnedName = null;
	}

	/** Drill from a fork: pin the chosen branch and its main continuation to a leaf. */
	pinLineFromMove(uci: string): void {
		const node = this.currentBookNode();
		const start = node?.children.find((c) => c.uci === uci);
		if (!start) return;
		this.pinnedLine = mainLinePath(this.game.uciMoves, start);
		this.pinnedName = null;
	}

	clearPin(): void {
		this.pinnedLine = null;
		this.pinnedName = null;
	}

	async start(): Promise<void> {
		const session = ++this.session;
		this.game.reset(this.practice?.fen, this.practice?.moves);
		this.inBook = this.opening !== null && this.practice === null;
		this.bookExhausted = false;
		this.feedback = [];
		this.hint = null;
		this.phase = 'botThinking';
		engine.setStrength({ elo: this.elo });
		await engine.newGame();
		if (session !== this.session) return;
		this.advanceTurn();
	}

	/** Leave practice mode and return to the normal trainer. */
	exitPractice(): void {
		this.session++;
		this.practice = null;
		this.game.reset();
		this.feedback = [];
		this.hint = null;
		this.phase = 'idle';
	}

	/** Board callback; also accepts a single UCI string (e.g. a fork-panel pick).
	 * Returns the played move or null if rejected. */
	onUserMove(fromOrUci: string, to?: string): PlayedMove | null {
		if (this.phase !== 'userTurn') return null;
		const nodeBefore = this.currentBookNode();
		const played = this.game.move(fromOrUci, to);
		if (!played) return null;
		this.hint = null;
		const ply = this.game.history.length - 1;
		void this.evaluateUserMove(played, ply, nodeBefore);
		this.advanceTurn();
		return played;
	}

	/** Leave the game — abandoned mid-play or closed after a natural end.
	 * Fresh board, back to setup. The reviewable "game over" state is reserved
	 * for natural ends; abandoning offers nothing the live game didn't. */
	endSession(): void {
		this.session++; // cancels in-flight bot replies and evals
		this.hint = null;
		this.feedback = [];
		this.game.reset(this.practice?.fen, this.practice?.moves);
		this.bookExhausted = false;
		this.inBook = this.opening !== null && this.practice === null;
		this.phase = 'idle';
	}

	/** Take back: rewind to just before the user's most recent move so it can be replayed. */
	takeBack(): void {
		if (!this.canTakeBack) return;
		const ply = this.lastUserPly();
		if (ply < 0) return;
		// In-flight bot replies for the abandoned line die on their own fen guards.
		this.game.undo(this.game.history.length - ply);
		this.feedback = this.feedback.filter((f) => f.ply < ply);
		// Honest book state after rewinding (the deviation may have been the undone move).
		const node = this.opening ? follow(this.opening.root, this.game.uciMoves) : null;
		this.inBook = node !== null;
		this.bookExhausted = node !== null && node.children.length === 0;
		this.hint = null;
		this.phase = 'userTurn';
	}

	/** Ply index of the user's most recent move (never inside a practice prelude), or -1. */
	private lastUserPly(): number {
		for (let i = this.game.history.length - 1; i >= this.game.basePly; i--) {
			if (this.game.colorOfPly(i) === this.userSide) return i;
		}
		return -1;
	}

	/** Green arrow for a trustworthy book move, blue arrow for the engine's best. */
	async showHint(): Promise<void> {
		if (this.phase !== 'userTurn' || this.hintLoading) return;
		const node = this.currentBookNode();
		// A pinned drill line is a deliberate choice — hint its next move as-is.
		const pinned = node ? resolvePinnedMove(this.pinnedLine, this.game.uciMoves, node) : null;
		if (pinned) {
			this.hint = { uci: pinned.uci, source: 'book' };
			return;
		}

		// The book stores popularity, not quality: at club level the most-played
		// move is frequently losing. Never hint a move the grader would flag —
		// verify the top book move with the engine and fall back to the engine's
		// best whenever the book move is worse than "good".
		const session = this.session;
		const fen = this.game.fen;
		const top = node && node.children.length > 0 ? pickMove(node.children, 0) : null;
		this.hintLoading = true;
		try {
			// Annotated books carry this position's eval on the node itself; use it
			// and skip the live probe. Otherwise ask the engine.
			let best: EvalScore & { bestUci: string | null };
			if (node?.eval) {
				best = toEvalScore(node.eval);
			} else {
				best = await engine.evaluate(fen, { movetimeMs: HINT_MOVETIME_MS });
				if (session !== this.session || this.game.fen !== fen) return;
			}

			// Only pay for a second eval when the book move isn't already the engine's
			// pick — and even then the child's annotation usually answers it.
			let bookAfter: EvalScore | null = null;
			if (top && top.uci !== best.bestUci) {
				const afterFen = this.fenAfterUci(fen, top.uci);
				if (afterFen) {
					bookAfter = terminalEval(afterFen) ?? (top.eval ? toEvalScore(top.eval) : null);
					if (!bookAfter) {
						bookAfter = await engine.evaluate(afterFen, { movetimeMs: HINT_MOVETIME_MS });
						if (session !== this.session || this.game.fen !== fen) return;
					}
				}
			}
			const bookUcis = node ? node.children.map((c) => c.uci) : [];
			this.hint = chooseHint(top?.uci ?? null, best, bookAfter, this.userSide, bookUcis);
		} finally {
			this.hintLoading = false;
		}
	}

	/** FEN after playing a UCI move from `fen`, or null if the move is illegal. */
	private fenAfterUci(fen: string, uci: string): string | null {
		const chess = new Chess(fen);
		try {
			chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || 'q' });
			return chess.fen();
		} catch {
			return null;
		}
	}

	/** Book continuations for the current position (null once out of book). */
	currentBookNode(): { children: BookNode[]; eval?: NodeEval } | null {
		if (!this.opening || !this.inBook) return null;
		return follow(this.opening.root, this.game.uciMoves);
	}

	private advanceTurn(): void {
		if (this.opening && this.inBook) {
			const node = follow(this.opening.root, this.game.uciMoves);
			if (node === null) this.inBook = false;
			else if (node.children.length === 0) this.bookExhausted = true;
		}
		if (this.game.isGameOver) {
			this.phase = 'gameOver';
			return;
		}
		if (this.game.turn === this.userSide) {
			this.phase = 'userTurn';
		} else {
			this.phase = 'botThinking';
			void this.botMove();
		}
	}

	private async botMove(): Promise<void> {
		const session = this.session;
		const fen = this.game.fen;
		let uci: string | null = null;

		if (this.opening && this.inBook) {
			const node = follow(this.opening.root, this.game.uciMoves);
			// A pinned line overrides sampling while the game is still on it.
			const pick = node
				? (resolvePinnedMove(this.pinnedLine, this.game.uciMoves, node) ??
					pickMove(node.children, temperatureFor(this.variability)))
				: null;
			if (pick) {
				await sleep(400);
				uci = pick.uci;
			} else {
				// No book reply for the bot: the line ran out rather than anyone deviating.
				if (node && node.children.length === 0) this.bookExhausted = true;
				this.inBook = false;
			}
		}

		if (!uci) {
			const [reply] = await Promise.all([engine.bestMove(fen, { movetimeMs: 400 }), sleep(300)]);
			uci = reply.uci;
		}

		// Bail if a new game started or the position changed (e.g. undo & retry).
		if (session !== this.session || this.game.fen !== fen) return;
		if (uci) this.game.move(uci);
		this.advanceTurn();
	}

	/**
	 * Grade the user move. Book moves are free and instant; otherwise two
	 * full-strength evals (before/after) run through the engine queue,
	 * concurrently with the bot's reply.
	 */
	private async evaluateUserMove(
		played: PlayedMove,
		ply: number,
		nodeBefore: { children: BookNode[]; eval?: NodeEval } | null
	): Promise<void> {
		const item: FeedbackItem = { ply, label: this.game.plyLabel(ply), san: played.san, badge: 'pending' };

		// First move past a completed pinned line: say so once, right where the
		// user expects "still part of the line" — silence here reads as a bug.
		const lineDone =
			this.pinnedLine && ply === this.pinnedLine.length && this.pinnedComplete
				? `${this.pinnedName ? `"${this.pinnedName}" complete` : 'Pinned line complete'} - you're on your own from here. `
				: '';

		if (nodeBefore && nodeBefore.children.length > 0) {
			const child = nodeBefore.children.find((c) => c.uci === played.uci);
			if (child) {
				// Annotated books carry a build-time eval on every node: grade the
				// reply from parent.before + child.after, no live probe (deterministic).
				const pre = precomputedEvals(nodeBefore.eval, child.eval);
				if (child.trap) {
					// Punished line: it's in the book so the BOT can exploit it.
					this.pushFeedback({
						...item,
						badge: 'trap',
						detail: 'A known trap — the bot knows how to punish this.',
						retriable: true
					});
					return;
				}
				const share = bookShare(child, nodeBefore.children);
				const verdict = bookVerdict(child, nodeBefore.children);
				if (verdict) {
					this.pushFeedback({
						...item,
						badge: verdict.badge,
						detail: lineDone + verdict.detail
					});
					// Popularity is not quality (trap openings use low-rating data):
					// verify and downgrade if the engine disagrees.
					void this.gradeMove(played, ply, share, lineDone, true, pre);
				} else {
					// In the explorer data but in no prepared line: popularity is
					// context, not endorsement — no book badge, full engine grading.
					this.pushFeedback({
						...item,
						detail: lineDone + `Popular here (${share}%) - not part of a prepared line.`
					});
					void this.gradeMove(played, ply, share, lineDone, false, pre);
				}
				return;
			}
		}

		this.pushFeedback(lineDone ? { ...item, detail: lineDone.trimEnd() } : item);
		void this.gradeMove(played, ply, null, lineDone);
	}

	/** Engine before/after grading; updates the feedback item for `ply`.
	 * `notePrefix` survives the detail rewrite (e.g. the pinned-line-complete note).
	 * An `endorsed` book move keeps its badge unless the engine objects; a
	 * merely-popular one (endorsed=false) always gets the engine's verdict. */
	private async gradeMove(
		played: PlayedMove,
		ply: number,
		bookShare: number | null,
		notePrefix = '',
		endorsed = true,
		precomputed?: { before: EvalScore & { bestUci: string | null }; after: EvalScore } | null
	): Promise<void> {
		// Terminal positions are graded without the engine (it can't eval them).
		const terminal = terminalEval(played.fenAfter);
		if (terminal?.mate !== undefined) {
			this.updateFeedback(ply, { badge: 'best', detail: notePrefix + 'Checkmate!' });
			return;
		}

		const session = this.session;
		let before: EvalScore & { bestUci: string | null };
		let after: EvalScore;
		if (precomputed) {
			// Annotated book move: instant, deterministic grade — no live probe, no
			// second-later badge flip.
			before = precomputed.before;
			after = terminal ?? precomputed.after;
		} else {
			before = await engine.evaluate(played.fenBefore, { movetimeMs: 400 });
			after = terminal ?? (await engine.evaluate(played.fenAfter, { movetimeMs: 400 }));
		}
		// Value comparison: $state deep-proxies stored objects, so identity checks always fail.
		const current = this.game.history[ply];
		if (session !== this.session || current?.uci !== played.uci || current?.fenAfter !== played.fenAfter) {
			return;
		}

		const quality = classifyMove(before, after, this.userSide, played.uci);
		const isBad = quality === 'mistake' || quality === 'blunder';
		// A verified book move keeps its badge only while the engine has no complaint.
		if (endorsed && bookShare !== null && quality !== 'inaccuracy' && !isBad) return;

		// Flagged moves also get a "why": the missed best move and the punish line,
		// read straight from the evals already in hand (no extra engine time).
		const flagged = isBad || quality === 'inaccuracy';
		const explain = flagged
			? (explainMove(played, before, after, this.userSide) ?? undefined)
			: undefined;

		// White-perspective evals (standard), plus the swing from the user's side.
		let delta = '';
		if (before.mate === undefined && after.mate === undefined) {
			const d = (toSideCp(after, this.userSide) - toSideCp(before, this.userSide)) / 100;
			delta = ` (${d >= 0 ? '+' : ''}${d.toFixed(1)} for you)`;
		}
		const evals = `${formatEval(before)} → ${formatEval(after)}${delta}`;
		// An inaccuracy that still leaves the user clearly winning is not "bad" —
		// low-rating book data makes this common, so calibrate the wording.
		const stillAhead = toSideCp(after, this.userSide) >= 150;
		let detail = evals;
		if (bookShare !== null) {
			const verdict = isBad
				? `but bad: ${evals}`
				: flagged
					? stillAhead
						? `but imprecise - you're still winning, a stronger move kept more: ${evals}`
						: `but the engine disagrees: ${evals}`
					: `and it holds up: ${evals}`;
			detail = `Played in ${bookShare}% of games here, ${verdict}`;
		}
		this.updateFeedback(ply, {
			badge: quality,
			detail: notePrefix + detail,
			retriable: isBad,
			explain
		});
	}

	private pushFeedback(item: FeedbackItem): void {
		this.feedback = [...this.feedback, item];
	}

	private updateFeedback(ply: number, patch: Partial<FeedbackItem>): void {
		this.feedback = this.feedback.map((f) => (f.ply === ply ? { ...f, ...patch } : f));
	}
}
