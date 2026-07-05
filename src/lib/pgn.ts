import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { PlayedMove } from '$lib/game.svelte';

export interface ParsedPgn {
	moves: PlayedMove[];
	/** PGN tag pairs, e.g. { White: 'vnz0r', Result: '1-0' }. */
	headers: Record<string, string>;
}

/**
 * Parse a single PGN game into the move shape the trainer uses, plus its headers.
 * Games starting from a `[FEN]` header are supported. Throws on unparseable PGN.
 */
export function parsePgn(pgn: string): ParsedPgn {
	const chess = new Chess();
	chess.loadPgn(pgn);
	const moves = chess.history({ verbose: true }).map((m) => ({
		san: m.san,
		uci: m.from + m.to + (m.promotion ?? ''),
		fenBefore: m.before,
		fenAfter: m.after
	}));
	const headers: Record<string, string> = {};
	for (const [key, value] of Object.entries(chess.getHeaders())) {
		if (value !== undefined) headers[key] = value;
	}
	return { moves, headers };
}

/** Replay a PGN into the same move shape the trainer uses. Throws on unparseable PGN. */
export function pgnToMoves(pgn: string): PlayedMove[] {
	return parsePgn(pgn).moves;
}

/**
 * Build a PGN from played moves. A non-standard start position is encoded via
 * `[SetUp]`/`[FEN]` headers so the game round-trips through {@link parsePgn}.
 */
export function movesToPgn(moves: PlayedMove[], headers: Record<string, string> = {}): string {
	// chess.js adds SetUp/FEN headers itself for a non-default start position.
	const chess = new Chess(moves[0]?.fenBefore ?? DEFAULT_POSITION);
	for (const [key, value] of Object.entries(headers)) chess.setHeader(key, value);
	for (const m of moves) chess.move(m.san);
	return chess.pgn();
}
