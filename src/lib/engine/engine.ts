import { base } from '$app/paths';
import { normalizeToWhite, parseBestMove, parseInfoLine, type EvalScore } from './uci';

export type Strength = { elo: number } | { full: true };

export interface EvalResult extends EvalScore {
	bestUci: string | null;
	pv: string[];
	/**
	 * Top lines, best first, when `multiPv > 1` was requested. Scores are
	 * White-normalized like the top-level one. Shorter than `multiPv` when the
	 * position has fewer legal moves.
	 */
	lines: { score: EvalScore; pv: string[] }[];
}

const ENGINE_JS = 'stockfish-18-lite-single.js';
/** UCI_Elo floor for stockfish; below this we fall back to Skill Level 0–5. */
export const UCI_ELO_FLOOR = 1320;
export const MIN_ELO = 400;
export const MAX_ELO = 2800;

/**
 * Singleton wrapper around a Stockfish web worker.
 * All commands go through a promise FIFO queue — exactly one `go` in flight.
 * Never bundled: the engine is served verbatim from static/stockfish/.
 */
class Engine {
	private worker: Worker | null = null;
	private initPromise: Promise<void> | null = null;
	private chain: Promise<unknown> = Promise.resolve();
	private listeners = new Set<(line: string) => void>();
	private playStrength: Strength = { full: true };

	init(): Promise<void> {
		if (this.initPromise) return this.initPromise;
		this.initPromise = new Promise<void>((resolve, reject) => {
			const worker = new Worker(`${base}/stockfish/${ENGINE_JS}`);
			this.worker = worker;
			worker.onmessage = (e: MessageEvent) => {
				const line = String(e.data);
				for (const listener of [...this.listeners]) listener(line);
			};
			worker.onerror = (e) => reject(new Error(`Stockfish worker error: ${e.message}`));
			this.expect((line) => (line === 'uciok' ? true : undefined)).then(() => resolve());
			worker.postMessage('uci');
		});
		return this.initPromise;
	}

	/** Strength used for bot moves (bestMove). Evaluation always runs at full strength. */
	setStrength(strength: Strength): void {
		this.playStrength = strength;
	}

	newGame(): Promise<void> {
		return this.enqueue(async () => {
			await this.init();
			this.send('ucinewgame');
			await this.ready();
		});
	}

	/** Best move at the configured play strength. */
	bestMove(fen: string, opts: { movetimeMs?: number } = {}): Promise<{ uci: string | null }> {
		const movetime = opts.movetimeMs ?? 400;
		return this.enqueue(async () => {
			await this.init();
			this.applyStrength(this.playStrength);
			this.setOption('MultiPV', '1');
			await this.ready();
			this.send(`position fen ${fen}`);
			const best = this.expect(parseBestMove);
			this.send(`go movetime ${movetime}`);
			return best;
		});
	}

	/**
	 * Full-strength evaluation. Scores normalized to White's perspective.
	 * `multiPv > 1` also returns the runner-up lines (review uses the gap to the
	 * second-best move to spot only-moves); it costs search speed, so leave it
	 * at 1 unless those lines are used.
	 */
	evaluate(fen: string, opts: { movetimeMs?: number; multiPv?: number } = {}): Promise<EvalResult> {
		const movetime = opts.movetimeMs ?? 400;
		const multiPv = Math.max(1, opts.multiPv ?? 1);
		const sideToMove = fen.split(' ')[1] as 'w' | 'b';
		return this.enqueue(async () => {
			await this.init();
			this.applyStrength({ full: true });
			this.setOption('MultiPV', String(multiPv));
			await this.ready();
			this.send(`position fen ${fen}`);
			// Deepest line seen per multipv rank; the engine re-emits all ranks each
			// iteration, so the last one for a rank is its final line.
			const byRank = new Map<number, { score: EvalScore; pv: string[] }>();
			const infoListener = (line: string) => {
				const info = parseInfoLine(line);
				if (info) byRank.set(info.multipv, { score: info.score, pv: info.pv });
			};
			this.listeners.add(infoListener);
			try {
				const best = this.expect(parseBestMove);
				this.send(`go movetime ${movetime}`);
				const { uci } = await best;
				const lines = [...byRank.entries()]
					.sort((a, b) => a[0] - b[0])
					.map(([, l]) => ({ score: normalizeToWhite(l.score, sideToMove), pv: l.pv }));
				const top = lines[0];
				return { ...(top?.score ?? {}), bestUci: uci, pv: top?.pv ?? [], lines };
			} finally {
				this.listeners.delete(infoListener);
			}
		});
	}

	private applyStrength(strength: Strength): void {
		if ('full' in strength) {
			this.setOption('UCI_LimitStrength', 'false');
			this.setOption('Skill Level', '20');
		} else if (strength.elo >= UCI_ELO_FLOOR) {
			this.setOption('Skill Level', '20');
			this.setOption('UCI_LimitStrength', 'true');
			this.setOption('UCI_Elo', String(strength.elo));
		} else {
			// Below the UCI_Elo floor: map [MIN_ELO, floor) onto Skill Level 0–5.
			const t = (strength.elo - MIN_ELO) / (UCI_ELO_FLOOR - MIN_ELO);
			const skill = Math.max(0, Math.min(5, Math.round(t * 5)));
			this.setOption('UCI_LimitStrength', 'false');
			this.setOption('Skill Level', String(skill));
		}
	}

	private setOption(name: string, value: string): void {
		this.send(`setoption name ${name} value ${value}`);
	}

	private send(cmd: string): void {
		this.worker?.postMessage(cmd);
	}

	private ready(): Promise<void> {
		const ok = this.expect((line) => (line === 'readyok' ? true : undefined));
		this.send('isready');
		return ok.then(() => undefined);
	}

	/** Resolve with the first non-nullish result of `match` over incoming lines. */
	private expect<T>(match: (line: string) => T | null | undefined): Promise<T> {
		return new Promise<T>((resolve) => {
			const listener = (line: string) => {
				const result = match(line);
				if (result !== null && result !== undefined) {
					this.listeners.delete(listener);
					resolve(result);
				}
			};
			this.listeners.add(listener);
		});
	}

	/** FIFO queue: each job runs after the previous one settles. */
	private enqueue<T>(job: () => Promise<T>): Promise<T> {
		const run = this.chain.then(job, job);
		this.chain = run.catch(() => {});
		return run;
	}
}

export const engine = new Engine();
