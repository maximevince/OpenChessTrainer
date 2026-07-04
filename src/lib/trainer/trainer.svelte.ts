import { Game, type Color } from '$lib/game.svelte';
import { engine } from '$lib/engine/engine';
import { follow, loadOpening } from '$lib/openings/tree';
import { pickMove, temperatureFor } from '$lib/openings/sampling';
import type { OpeningTree } from '$lib/openings/types';

export type TrainerPhase = 'idle' | 'userTurn' | 'botThinking' | 'gameOver';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Trainer {
	game = new Game();

	opening = $state<OpeningTree | null>(null);
	userSide = $state<Color>('white');
	elo = $state(1600);
	/** 0 = always the most popular book move; 1 = wide sampling. */
	variability = $state(0.4);
	/** True while the bot is still following its opening book. Never re-enters. */
	inBook = $state(true);
	phase = $state<TrainerPhase>('idle');

	botSide = $derived<Color>(this.userSide === 'white' ? 'black' : 'white');

	/** Incremented on every new game; stale async work checks it and bails. */
	private session = 0;

	async selectOpening(id: string | null): Promise<void> {
		this.opening = id ? await loadOpening(id) : null;
		if (this.opening && this.opening.botSide !== 'both') {
			this.userSide = this.opening.botSide === 'white' ? 'black' : 'white';
		}
	}

	async start(): Promise<void> {
		const session = ++this.session;
		this.game.reset();
		this.inBook = this.opening !== null;
		this.phase = 'botThinking';
		engine.setStrength({ elo: this.elo });
		await engine.newGame();
		if (session !== this.session) return;
		this.advanceTurn();
	}

	/** Board callback. Returns the played move or null if rejected. */
	onUserMove(from: string, to: string) {
		if (this.phase !== 'userTurn') return null;
		const played = this.game.move(from, to);
		if (!played) return null;
		this.advanceTurn();
		return played;
	}

	/** Book continuations for the current position (null once out of book). */
	currentBookNode() {
		if (!this.opening || !this.inBook) return null;
		return follow(this.opening.root, this.game.uciMoves);
	}

	private advanceTurn(): void {
		if (this.opening && this.inBook && currentNodeIsOff(this.opening, this.game.uciMoves)) {
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
		let uci: string | null = null;

		if (this.opening && this.inBook) {
			const node = follow(this.opening.root, this.game.uciMoves);
			const pick = node ? pickMove(node.children, temperatureFor(this.variability)) : null;
			if (pick) {
				await sleep(400);
				if (session !== this.session) return;
				uci = pick.uci;
			} else {
				this.inBook = false;
			}
		}

		if (!uci) {
			const fen = this.game.fen;
			const [reply] = await Promise.all([engine.bestMove(fen, { movetimeMs: 400 }), sleep(300)]);
			if (session !== this.session || this.game.fen !== fen) return;
			uci = reply.uci;
		}

		if (uci) this.game.move(uci);
		this.advanceTurn();
	}
}

function currentNodeIsOff(opening: OpeningTree, uciMoves: string[]): boolean {
	return follow(opening.root, uciMoves) === null;
}
