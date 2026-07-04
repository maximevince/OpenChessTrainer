import { Chess } from 'chess.js';
import type { PlayedMove } from '$lib/game.svelte';

/** Replay a PGN into the same move shape the trainer uses. Throws on unparseable PGN. */
export function pgnToMoves(pgn: string): PlayedMove[] {
	const parsed = new Chess();
	parsed.loadPgn(pgn);
	const replay = new Chess();
	return parsed.history({ verbose: true }).map((m) => {
		const fenBefore = replay.fen();
		replay.move(m.san);
		return {
			san: m.san,
			uci: m.from + m.to + (m.promotion ?? ''),
			fenBefore,
			fenAfter: replay.fen()
		};
	});
}
