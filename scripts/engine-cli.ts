/**
 * Minimal UCI driver over the headless Stockfish node build, shared by the
 * offline scripts (audit-hints, annotate-quality). Browser code uses the web
 * worker in src/lib/engine instead; this is the Node-side twin.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeToWhite, parseBestMove, type EvalScore } from '../src/lib/engine/uci';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ENGINE_JS = join(
	HERE,
	'..',
	'node_modules',
	'stockfish',
	'bin',
	'stockfish-18-lite-single.js'
);

/** chess.js move descriptor from a UCI string. */
export function uciMove(uci: string) {
	return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || 'q' };
}

export class Engine {
	private proc!: ChildProcessWithoutNullStreams;
	private buf = '';
	private handlers: Array<(l: string) => void> = [];

	async start(): Promise<void> {
		this.proc = spawn('node', [ENGINE_JS], { stdio: ['pipe', 'pipe', 'pipe'] });
		this.proc.stdout.on('data', (d) => {
			this.buf += d.toString();
			let i;
			while ((i = this.buf.indexOf('\n')) >= 0) {
				const line = this.buf.slice(0, i).trim();
				this.buf = this.buf.slice(i + 1);
				for (const h of [...this.handlers]) h(line);
			}
		});
		this.send('uci');
		await this.until((l) => l === 'uciok');
		this.send('setoption name UCI_LimitStrength value false');
		this.send('setoption name Skill Level value 20');
		this.send('isready');
		await this.until((l) => l === 'readyok');
	}

	/** Search `fen` for `movetimeMs`; returns the engine's best move and the score
	 * relative to the side to move. */
	async evaluate(fen: string, movetimeMs: number): Promise<{ bestUci: string | null; score: EvalScore }> {
		this.send(`position fen ${fen}`);
		let score: EvalScore | null = null;
		// Capture the score from any non-bound info line (the final line before
		// bestmove sometimes lacks the trailing pv parseInfoLine requires).
		const onInfo = (l: string) => {
			if (!l.startsWith('info ') || l.includes('lowerbound') || l.includes('upperbound')) return;
			const m = /\bscore (cp|mate) (-?\d+)/.exec(l);
			if (m) score = m[1] === 'cp' ? { cp: Number(m[2]) } : { mate: Number(m[2]) };
		};
		this.handlers.push(onInfo);
		this.send(`go movetime ${movetimeMs}`);
		const best = await this.until((l) => parseBestMove(l) !== null);
		this.handlers = this.handlers.filter((h) => h !== onInfo);
		return { bestUci: parseBestMove(best)!.uci, score: score ?? {} };
	}

	/** Evaluate `fen`, returning the score from WHITE's perspective plus the best move. */
	async evaluateWhite(
		fen: string,
		movetimeMs: number,
		sideToMove: 'w' | 'b'
	): Promise<{ bestUci: string | null; score: EvalScore }> {
		const { bestUci, score } = await this.evaluate(fen, movetimeMs);
		return { bestUci, score: normalizeToWhite(score, sideToMove) };
	}

	private until(match: (l: string) => unknown): Promise<string> {
		return new Promise((resolve) => {
			const h = (l: string) => {
				if (match(l)) {
					this.handlers = this.handlers.filter((x) => x !== h);
					resolve(l);
				}
			};
			this.handlers.push(h);
		});
	}

	private send(cmd: string): void {
		this.proc.stdin.write(cmd + '\n');
	}

	quit(): void {
		try {
			this.send('quit');
			this.proc.kill();
		} catch {
			/* already gone */
		}
	}
}
