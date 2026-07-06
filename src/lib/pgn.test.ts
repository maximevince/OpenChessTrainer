import { describe, expect, it } from 'vitest';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { PlayedMove } from '$lib/game.svelte';
import { movesToPgn, parsePgn, pgnToMoves } from './pgn';

/** Build PlayedMove[] fixtures the same way the Game class does. */
function play(sans: string[], startFen = DEFAULT_POSITION): PlayedMove[] {
	const chess = new Chess(startFen);
	return sans.map((san) => {
		const fenBefore = chess.fen();
		const m = chess.move(san);
		return {
			san: m.san,
			uci: m.from + m.to + (m.promotion ?? ''),
			fenBefore,
			fenAfter: chess.fen()
		};
	});
}

const SCHOLARS = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'];

describe('movesToPgn', () => {
	it('renders movetext with headers and result', () => {
		const pgn = movesToPgn(play(SCHOLARS), { White: 'You', Black: 'Bot', Result: '1-0' });
		expect(pgn).toContain('[White "You"]');
		expect(pgn).toContain('[Result "1-0"]');
		expect(pgn).toContain('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0');
	});

	it('encodes a non-standard start position via SetUp/FEN headers', () => {
		const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR b KQkq - 3 3';
		const pgn = movesToPgn(play(['Nf6', 'Nf3'], fen));
		expect(pgn).toContain('[SetUp "1"]');
		expect(pgn).toContain(`[FEN "${fen}"]`);
		expect(pgn).toContain('3. ... Nf6 4. Nf3');
	});

	it('handles an empty game', () => {
		expect(movesToPgn([])).not.toContain('1.');
	});

	it('transliterates tag values to printable ASCII (byte-naive parsers reject the file otherwise)', () => {
		const pgn = movesToPgn(play(['d4']), {
			Opening: 'Alice – Bob — Queen’s Gambit (early …Qf6), “Réti” ½-½'
		});
		expect(pgn).toContain(`[Opening "Alice - Bob - Queen's Gambit (early ...Qf6), 'Reti' 1/2-1/2"]`);
		// The whole output must be pure ASCII, not just that one tag.
		expect(pgn).toMatch(/^[\x00-\x7f]*$/);
	});
});

describe('pgnToMoves / parsePgn', () => {
	it('round-trips a standard game', () => {
		const moves = play(SCHOLARS);
		expect(pgnToMoves(movesToPgn(moves))).toEqual(moves);
	});

	it('round-trips a game starting from a FEN', () => {
		const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR b KQkq - 3 3';
		const moves = play(['Nf6', 'Nf3'], fen);
		const back = pgnToMoves(movesToPgn(moves));
		expect(back).toEqual(moves);
		expect(back[0].fenBefore).toBe(fen);
	});

	it('exposes headers', () => {
		const { headers, moves } = parsePgn(movesToPgn(play(['d4']), { White: 'vnz0r', Opening: 'London' }));
		expect(headers.White).toBe('vnz0r');
		expect(headers.Opening).toBe('London');
		expect(moves).toHaveLength(1);
	});

	it('throws on garbage', () => {
		expect(() => pgnToMoves('not a pgn at all %%%')).toThrow();
	});
});
