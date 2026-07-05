/** Shared read-only move browsing: derive board state from a move list + ply. */
import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { Key } from 'chessground/types';
import { turnOfFen, type Color, type PlayedMove } from '$lib/game.svelte';

export interface BrowsePosition {
	fen: string;
	lastMove: [Key, Key] | undefined;
	check: boolean;
	turn: Color;
}

/** Board state after `ply` plies of `moves` (ply 0 = the game's start position). */
export function positionAt(moves: PlayedMove[], ply: number): BrowsePosition {
	const m = ply > 0 ? moves[ply - 1] : undefined;
	const fen = m ? m.fenAfter : (moves[0]?.fenBefore ?? DEFAULT_POSITION);
	return {
		fen,
		lastMove: m ? [m.uci.slice(0, 2) as Key, m.uci.slice(2, 4) as Key] : undefined,
		check: new Chess(fen).inCheck(),
		turn: turnOfFen(fen)
	};
}

/** True when a keyboard event targets a form field, so board nav should stay out of the way. */
export function isTypingTarget(e: Event): boolean {
	const t = e.target as HTMLElement | null;
	return !!t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName);
}
