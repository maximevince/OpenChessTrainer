import { Chess } from 'chess.js';

/**
 * "Why was this move bad": the engine move that should have been played, and
 * the opponent's strongest punish line. Built purely from data the grader
 * already has (the before/after evals carry bestUci and pv), so explaining a
 * move costs no extra engine time.
 */
export interface Explanation {
	/** SAN of the engine's best move in the position before the user's move. */
	bestSan: string | null;
	/** UCI of that move, for drawing an arrow on the before-position. */
	bestUci: string | null;
	/** Opponent's punish line in numbered SAN, e.g. "13...Qxb2 14.Rb1 Qxa2". */
	refutationLine: string | null;
	/** First move of the punish line, for drawing an arrow on the after-position. */
	refutationUci: string | null;
}

/** Keep punish lines short enough to read at a glance (three full moves). */
const MAX_REFUTATION_PLIES = 6;

/** Play a UCI pv out from `fen`, stopping at the first illegal move. */
function playLine(fen: string, ucis: readonly string[], maxPlies: number): { san: string; uci: string; numbered: string }[] {
	let chess: Chess;
	try {
		chess = new Chess(fen);
	} catch {
		return [];
	}
	const out: { san: string; uci: string; numbered: string }[] = [];
	for (const uci of ucis.slice(0, maxPlies)) {
		const white = chess.turn() === 'w';
		const num = chess.moveNumber();
		let san: string;
		try {
			san = chess.move({
				from: uci.slice(0, 2),
				to: uci.slice(2, 4),
				promotion: uci.slice(4, 5) || undefined
			}).san;
		} catch {
			break; // pv disagrees with the position (stale line) — keep the trusted prefix
		}
		// PGN-style numbering: "13.Qb2" for White, "13...Qxb2" when Black starts the line.
		const numbered = white ? `${num}.${san}` : out.length === 0 ? `${num}...${san}` : san;
		out.push({ san, uci, numbered });
	}
	return out;
}

/** A pv as one numbered SAN string, e.g. "1.e4 e5 2.Nf3"; null if none of it is legal. */
export function numberedLine(
	fen: string,
	ucis: readonly string[],
	maxPlies = MAX_REFUTATION_PLIES
): string | null {
	const moves = playLine(fen, ucis, maxPlies);
	return moves.length > 0 ? moves.map((m) => m.numbered).join(' ') : null;
}

/**
 * Explain a flagged move from the grader's before/after evals: what should
 * have been played (`before.bestUci`) and how the opponent punishes what was
 * played (`after.pv`). Returns null when the evals carry nothing to show
 * (e.g. the after-position is terminal and the best move was the one played).
 */
export function explainMove(
	played: { fenBefore: string; fenAfter: string; uci: string },
	before: { bestUci?: string | null; pv?: readonly string[] },
	// The after-eval may be a bare terminal score (no pv when the game just ended).
	after: { cp?: number; mate?: number; pv?: readonly string[] }
): Explanation | null {
	let bestSan: string | null = null;
	let bestUci: string | null = null;
	if (before.bestUci && before.bestUci !== played.uci) {
		const [best] = playLine(played.fenBefore, [before.bestUci], 1);
		if (best) {
			bestSan = best.san;
			bestUci = best.uci;
		}
	}

	const punish = after.pv ? playLine(played.fenAfter, after.pv, MAX_REFUTATION_PLIES) : [];
	const refutationLine = punish.length > 0 ? punish.map((m) => m.numbered).join(' ') : null;
	const refutationUci = punish[0]?.uci ?? null;

	if (!bestSan && !refutationLine) return null;
	return { bestSan, bestUci, refutationLine, refutationUci };
}
