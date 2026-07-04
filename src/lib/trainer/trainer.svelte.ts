import { Game, type Color, type PlayedMove } from '$lib/game.svelte';
import { engine } from '$lib/engine/engine';
import { follow, loadOpening } from '$lib/openings/tree';
import { pickMove, temperatureFor } from '$lib/openings/sampling';
import type { BookNode, OpeningTree } from '$lib/openings/types';
import { terminalEval } from '$lib/terminal';
import { classifyMove, formatEval, toSideCp, type MoveQuality } from './classify';

export type TrainerPhase = 'idle' | 'userTurn' | 'botThinking' | 'gameOver';

export type FeedbackBadge = MoveQuality | 'book-best' | 'book' | 'trap' | 'pending';

export interface FeedbackItem {
	/** Ply index of the user move in game history. */
	ply: number;
	moveNumber: number;
	san: string;
	badge: FeedbackBadge;
	detail?: string;
	retriable?: boolean;
}

export interface Hint {
	uci: string;
	source: 'book' | 'engine';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Trainer {
	game = new Game();

	opening = $state<OpeningTree | null>(null);
	/** Train playing the opening yourself, or refuting it (bot plays it). */
	mode = $state<'play' | 'refute'>('refute');
	/** Side choice for free play (no opening selected). */
	manualSide = $state<Color>('white');
	elo = $state(1600);
	/** 0 = always the most popular book move; 1 = wide sampling. */
	variability = $state(0.4);
	/** True while the bot is still following its opening book. */
	inBook = $state(true);
	phase = $state<TrainerPhase>('idle');
	feedback = $state<FeedbackItem[]>([]);
	hint = $state<Hint | null>(null);
	hintLoading = $state(false);

	userSide = $derived.by<Color>(() => {
		if (!this.opening) return this.manualSide;
		const openingSide = this.opening.side;
		const otherSide: Color = openingSide === 'white' ? 'black' : 'white';
		return this.mode === 'play' ? openingSide : otherSide;
	});
	botSide = $derived<Color>(this.userSide === 'white' ? 'black' : 'white');
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
		this.opening = id ? await loadOpening(id) : null;
	}

	async start(): Promise<void> {
		const session = ++this.session;
		this.game.reset();
		this.inBook = this.opening !== null;
		this.feedback = [];
		this.hint = null;
		this.phase = 'botThinking';
		engine.setStrength({ elo: this.elo });
		await engine.newGame();
		if (session !== this.session) return;
		this.advanceTurn();
	}

	/** Board callback. Returns the played move or null if rejected. */
	onUserMove(from: string, to: string): PlayedMove | null {
		if (this.phase !== 'userTurn') return null;
		const nodeBefore = this.currentBookNode();
		const played = this.game.move(from, to);
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

	/** Ply index of the user's most recent move, or -1. */
	private lastUserPly(): number {
		const userIsWhite = this.userSide === 'white';
		for (let i = this.game.history.length - 1; i >= 0; i--) {
			if ((i % 2 === 0) === userIsWhite) return i;
		}
		return -1;
	}

	/** Green arrow for the top book move, blue arrow for the engine's best. */
	async showHint(): Promise<void> {
		if (this.phase !== 'userTurn' || this.hintLoading) return;
		const node = this.currentBookNode();
		const top = node && node.children.length > 0 ? pickMove(node.children, 0) : null;
		if (top) {
			this.hint = { uci: top.uci, source: 'book' };
			return;
		}
		const session = this.session;
		const fen = this.game.fen;
		this.hintLoading = true;
		try {
			const result = await engine.evaluate(fen, { movetimeMs: 400 });
			if (session !== this.session || this.game.fen !== fen) return;
			this.hint = result.bestUci ? { uci: result.bestUci, source: 'engine' } : null;
		} finally {
			this.hintLoading = false;
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
			const pick = node ? pickMove(node.children, temperatureFor(this.variability)) : null;
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
		const moveNumber = Math.floor(ply / 2) + 1;
		const item: FeedbackItem = { ply, moveNumber, san: played.san, badge: 'pending' };

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
				const total = nodeBefore.children.reduce((s, c) => s + c.weight, 0);
				const isTop = child.weight >= Math.max(...nodeBefore.children.map((c) => c.weight));
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

		const quality = classifyMove(before, after, this.userSide);
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
