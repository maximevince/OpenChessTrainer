/** Pure UCI parsing/normalization helpers (unit-tested; no worker/browser deps). */

export interface EvalScore {
	/** Centipawns, from White's perspective once normalized. */
	cp?: number;
	/** Moves to mate; positive = the normalized side mates. */
	mate?: number;
}

/**
 * UCI `score` is relative to the side to move. Normalize to White's perspective.
 * This is the ONLY place score flipping happens.
 */
export function normalizeToWhite(score: EvalScore, sideToMove: 'w' | 'b'): EvalScore {
	if (sideToMove === 'w') return score;
	return {
		cp: score.cp === undefined ? undefined : -score.cp,
		mate: score.mate === undefined ? undefined : -score.mate
	};
}

export interface InfoLine {
	depth: number;
	score: EvalScore;
	pv: string[];
}

/** Parse a UCI `info` line carrying a score and pv; null for anything else. */
export function parseInfoLine(line: string): InfoLine | null {
	if (!line.startsWith('info ')) return null;
	// Bound scores are transient search artifacts, not final evaluations.
	if (line.includes('lowerbound') || line.includes('upperbound')) return null;
	const depth = /\bdepth (\d+)/.exec(line);
	const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
	const pv = /\bpv ((?:[a-h][1-8][a-h][1-8][qrbn]? ?)+)$/.exec(line);
	if (!depth || !score || !pv) return null;
	return {
		depth: Number(depth[1]),
		score: score[1] === 'cp' ? { cp: Number(score[2]) } : { mate: Number(score[2]) },
		pv: pv[1].trim().split(' ')
	};
}

/** Parse a `bestmove` line; null for anything else. `(none)` (mate/stalemate) → null uci. */
export function parseBestMove(line: string): { uci: string | null } | null {
	const m = /^bestmove (\S+)/.exec(line);
	if (!m) return null;
	return { uci: m[1] === '(none)' ? null : m[1] };
}
