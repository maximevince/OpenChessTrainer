import { Chess } from 'chess.js';
import type { EvalScore } from '$lib/engine/uci';

/**
 * Exact evaluation for game-over positions, or null for ongoing ones.
 * The engine cannot be asked about terminal positions: it answers
 * `bestmove (none)` with a signless "mate 0", which downstream code would
 * misread as 0.00 — grading a delivered checkmate as a blunder.
 * Checkmate is expressed as ±mate-1 (sign = winner) so win% and formatting work.
 */
export function terminalEval(fen: string): EvalScore | null {
	const pos = new Chess(fen);
	if (pos.isCheckmate()) return { mate: pos.turn() === 'w' ? -1 : 1 };
	if (pos.isGameOver()) return { cp: 0 }; // stalemate and other draws
	return null;
}
