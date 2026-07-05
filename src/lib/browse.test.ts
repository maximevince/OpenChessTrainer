import { describe, expect, it } from 'vitest';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { positionAt } from './browse';
import type { PlayedMove } from './game.svelte';

/** Build a move list by playing SAN from a start FEN, in the trainer's shape. */
function makeMoves(sans: string[], startFen = DEFAULT_POSITION): PlayedMove[] {
	const chess = new Chess(startFen);
	return sans.map((san) => {
		const before = chess.fen();
		const m = chess.move(san);
		return { san: m.san, uci: m.from + m.to + (m.promotion ?? ''), fenBefore: before, fenAfter: chess.fen() };
	});
}

describe('positionAt', () => {
	const moves = makeMoves(['e4', 'e5', 'Nf3']);

	it('ply 0 is the start position with no last move', () => {
		const p = positionAt(moves, 0);
		expect(p.fen).toBe(DEFAULT_POSITION);
		expect(p.lastMove).toBeUndefined();
		expect(p.turn).toBe('white');
	});

	it('mid-game ply reflects the move played and whose turn it is', () => {
		const p = positionAt(moves, 1);
		expect(p.fen).toBe(moves[0].fenAfter);
		expect(p.lastMove).toEqual(['e2', 'e4']);
		expect(p.turn).toBe('black');
	});

	it('detects check from the shown FEN', () => {
		// Scholar's-mate position: the final move is checkmate (in check).
		const mate = makeMoves(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']);
		expect(positionAt(mate, mate.length).check).toBe(true);
	});

	it('ply 0 uses the game start FEN, not the default (practice from a position)', () => {
		const startFen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
		const practice = makeMoves(['Bc5'], startFen);
		const p = positionAt(practice, 0);
		expect(p.fen).toBe(startFen);
		expect(p.turn).toBe('black');
	});
});
