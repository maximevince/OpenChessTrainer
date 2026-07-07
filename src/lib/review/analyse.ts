import { DEFAULT_POSITION } from 'chess.js';
import { engine } from '$lib/engine/engine';
import { terminalEval } from '$lib/terminal';
import type { EvalScore } from '$lib/engine/uci';
import { colorOfPlyFrom, turnOfFen, type PlayedMove, type Color } from '$lib/game.svelte';
import { loadIndex, loadOpening } from '$lib/openings/tree';
import type { BookNode } from '$lib/openings/types';
import { explainMove, type Explanation } from '$lib/trainer/explain';
import {
	classifyByWinDrop,
	gameAccuracy,
	moveAccuracy,
	winPct,
	winPctFor,
	type ReviewQuality
} from './accuracy';

export interface PositionEval extends EvalScore {
	bestUci: string | null;
	pv: string[];
}

export interface MoveReport {
	ply: number;
	san: string;
	quality: ReviewQuality | 'book';
	accuracy: number;
	/** White win% after this move (graph y-value). */
	winPctAfter: number;
	/** Explanation for flagged non-book moves, built from the retained PVs. */
	explain?: Explanation;
}

export interface GameReport {
	/** evals[i] = eval of the position before ply i; length = plies + 1. */
	evals: PositionEval[];
	moves: MoveReport[];
	accuracy: { white: number; black: number };
	counts: Record<Color, Partial<Record<MoveReport['quality'], number>>>;
}

export interface AnalyseOptions {
	movetimeMs: number;
	onProgress?: (done: number, total: number) => void;
	signal?: { cancelled: boolean };
}

/**
 * Sequential full-strength eval of every position in the game, then move
 * grading and accuracy. Total time ≈ (plies + 1) × movetime.
 */
export async function analyseGame(moves: PlayedMove[], opts: AnalyseOptions): Promise<GameReport | null> {
	const fens = [moves[0]?.fenBefore ?? DEFAULT_POSITION, ...moves.map((m) => m.fenAfter)];
	const total = fens.length;
	const evals: PositionEval[] = [];

	for (let i = 0; i < total; i++) {
		if (opts.signal?.cancelled) return null;
		// Terminal positions get an exact eval — the engine can't assess them.
		const terminal = terminalEval(fens[i]);
		if (terminal) {
			evals.push({ ...terminal, bestUci: null, pv: [] });
		} else {
			const result = await engine.evaluate(fens[i], { movetimeMs: opts.movetimeMs });
			evals.push({ cp: result.cp, mate: result.mate, bestUci: result.bestUci, pv: result.pv });
		}
		opts.onProgress?.(i + 1, total);
	}

	const bookPlies = await bookPrefix(moves);
	if (opts.signal?.cancelled) return null;

	return buildGameReport(moves, evals, bookPlies);
}

/** Build the review report from precomputed evals. Pure so explanation behavior is unit-testable. */
export function buildGameReport(
	moves: PlayedMove[],
	evals: PositionEval[],
	bookPlies: number
): GameReport {
	const startFen = moves[0]?.fenBefore ?? DEFAULT_POSITION;
	const startColor = turnOfFen(startFen);
	const reports: MoveReport[] = [];
	const accs: Record<Color, number[]> = { white: [], black: [] };
	const counts: GameReport['counts'] = { white: {}, black: {} };

	for (let ply = 0; ply < moves.length; ply++) {
		const mover: Color = colorOfPlyFrom(ply, startColor);
		const before = winPctFor(evals[ply], mover);
		const after = winPctFor(evals[ply + 1], mover);
		let quality: MoveReport['quality'];
		if (ply < bookPlies) {
			quality = 'book';
		} else if (moves[ply].uci === evals[ply].bestUci) {
			quality = 'best';
		} else {
			quality = classifyByWinDrop(before, after);
		}
		const acc = ply < bookPlies ? 100 : moveAccuracy(before, after);
		accs[mover].push(acc);
		counts[mover][quality] = (counts[mover][quality] ?? 0) + 1;
		const flagged = quality === 'inaccuracy' || quality === 'mistake' || quality === 'blunder';
		const explain =
			flagged && quality !== 'book'
				? (explainMove(moves[ply], evals[ply], evals[ply + 1], mover) ?? undefined)
				: undefined;
		reports.push({
			ply,
			san: moves[ply].san,
			quality,
			accuracy: acc,
			winPctAfter: winPct(evals[ply + 1]),
			explain
		});
	}

	return {
		evals,
		moves: reports,
		accuracy: { white: gameAccuracy(accs.white), black: gameAccuracy(accs.black) },
		counts
	};
}

/** How many leading plies of the game are in any bundled opening book. */
async function bookPrefix(moves: PlayedMove[]): Promise<number> {
	try {
		const index = await loadIndex();
		const trees = await Promise.all(index.openings.map((o) => loadOpening(o.id)));
		const ucis = moves.map((m) => m.uci);
		let best = 0;
		for (const tree of trees) {
			// Walk each tree once, descending as far as the game follows the book.
			let node: { children: BookNode[] } = tree.root;
			let n = 0;
			while (n < ucis.length) {
				const child = node.children.find((c) => c.uci === ucis[n]);
				if (!child) break;
				node = child;
				n++;
			}
			if (n > best) best = n;
		}
		return best;
	} catch {
		return 0; // books unavailable — grade everything with the engine
	}
}
