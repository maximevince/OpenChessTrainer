import { Game, type Color, type PlayedMove } from '$lib/game.svelte';
import { engine } from '$lib/engine/engine';
import { follow, loadOpening } from '$lib/openings/tree';
import { pickMove, temperatureFor } from '$lib/openings/sampling';
import { resolvePinnedMove, isOnPinnedLine, mainLinePath } from '$lib/openings/pinning';
import type { BookNode, OpeningTree, OpeningVariation } from '$lib/openings/types';
import { terminalEval } from '$lib/terminal';
import { classifyMove, formatEval, toSideCp, type MoveQuality } from './classify';
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

	/** Abandon the current game and return to setup. Board keeps the final position. */
	endGame(): void {
		this.session++; // cancels in-flight bot replies and evals
		this.hint = null;
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
		this.inBook =
			this.opening !== null && follow(this.opening.root, this.game.uciMoves) !== null;
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
			const best = await engine.evaluate(fen, { movetimeMs: HINT_MOVETIME_MS });
			if (session !== this.session || this.game.fen !== fen) return;

			// Only pay for a second eval when the book move isn't already the engine's pick.
			let bookAfter: EvalScore | null = null;
			if (top && top.uci !== best.bestUci) {
				const afterFen = this.fenAfterUci(fen, top.uci);
				bookAfter = afterFen
					? (terminalEval(afterFen) ??
						(await engine.evaluate(afterFen, { movetimeMs: HINT_MOVETIME_MS })))
					: null;
				if (session !== this.session || this.game.fen !== fen) return;
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
	currentBookNode(): { children: BookNode[] } | null {
		if (!this.opening || !this.inBook) return null;
		return follow(this.opening.root, this.game.uciMoves);
	}

	private advanceTurn(): void {
		if (this.opening && this.inBook && follow(this.opening.root, this.game.uciMoves) === null) {
			this.inBook = false;
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
		nodeBefore: { children: BookNode[] } | null
	): Promise<void> {
		const item: FeedbackItem = { ply, label: this.game.plyLabel(ply), san: played.san, badge: 'pending' };

		if (nodeBefore && nodeBefore.children.length > 0) {
			const child = nodeBefore.children.find((c) => c.uci === played.uci);
			if (child) {
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
				// Traps aren't real book moves: exclude them so the top recommendation
				// (e.g. the refutation) earns "book-best" even when a trap is more popular.
				const real = nodeBefore.children.filter((c) => !c.trap);
				const total = real.reduce((s, c) => s + c.weight, 0);
				const isTop = child.weight >= Math.max(...real.map((c) => c.weight));
				const share = total > 0 ? Math.round((100 * child.weight) / total) : 0;
				this.pushFeedback({
					...item,
					badge: isTop ? 'book-best' : 'book',
					detail: share > 0 ? `Book move — played in ${share}% of games here` : 'Book move'
				});
				// Popularity is not quality (trap openings use low-rating data):
				// verify in the background and downgrade if the engine disagrees.
				void this.gradeMove(played, ply, share);
				return;
			}
		}

		this.pushFeedback(item);
		void this.gradeMove(played, ply, null);
	}

	/** Engine before/after grading; updates the feedback item for `ply`. */
	private async gradeMove(played: PlayedMove, ply: number, bookShare: number | null): Promise<void> {
		// Terminal positions are graded without the engine (it can't eval them).
		const terminal = terminalEval(played.fenAfter);
		if (terminal?.mate !== undefined) {
			this.updateFeedback(ply, { badge: 'best', detail: 'Checkmate!' });
			return;
		}

		const session = this.session;
		const before = await engine.evaluate(played.fenBefore, { movetimeMs: 400 });
		const after = terminal ?? (await engine.evaluate(played.fenAfter, { movetimeMs: 400 }));
		// Value comparison: $state deep-proxies stored objects, so identity checks always fail.
		const current = this.game.history[ply];
		if (session !== this.session || current?.uci !== played.uci || current?.fenAfter !== played.fenAfter) {
			return;
		}

		const quality = classifyMove(before, after, this.userSide, played.uci);
		const isBad = quality === 'mistake' || quality === 'blunder';
		// A verified book move keeps its badge only while the engine has no complaint.
		if (bookShare !== null && quality !== 'inaccuracy' && !isBad) return;

		// White-perspective evals (standard), plus the swing from the user's side.
		let delta = '';
		if (before.mate === undefined && after.mate === undefined) {
			const d = (toSideCp(after, this.userSide) - toSideCp(before, this.userSide)) / 100;
			delta = ` (${d >= 0 ? '+' : ''}${d.toFixed(1)} for you)`;
		}
		const evals = `${formatEval(before)} → ${formatEval(after)}${delta}`;
		this.updateFeedback(ply, {
			badge: quality,
			detail:
				bookShare !== null
					? `Played in ${bookShare}% of games here, but bad: ${evals}`
					: evals,
			retriable: isBad
		});
	}

	private pushFeedback(item: FeedbackItem): void {
		this.feedback = [...this.feedback, item];
	}

	private updateFeedback(ply: number, patch: Partial<FeedbackItem>): void {
		this.feedback = this.feedback.map((f) => (f.ply === ply ? { ...f, ...patch } : f));
	}
}
