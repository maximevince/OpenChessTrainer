import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { Game, colorOfPlyFrom, moveNumberOfPlyFrom, plyLabel, turnOfFen, type PlayedMove } from './game.svelte';

describe('colorOfPlyFrom', () => {
	it('alternates from White when White starts', () => {
		expect(colorOfPlyFrom(0, 'white')).toBe('white');
		expect(colorOfPlyFrom(1, 'white')).toBe('black');
		expect(colorOfPlyFrom(2, 'white')).toBe('white');
	});

	it('alternates from Black when Black starts (FEN mid-game)', () => {
		expect(colorOfPlyFrom(0, 'black')).toBe('black');
		expect(colorOfPlyFrom(1, 'black')).toBe('white');
		expect(colorOfPlyFrom(2, 'black')).toBe('black');
	});
});

describe('moveNumberOfPlyFrom', () => {
	it('numbers plies from a White start', () => {
		expect(moveNumberOfPlyFrom(0, 'white', 1)).toBe(1);
		expect(moveNumberOfPlyFrom(1, 'white', 1)).toBe(1);
		expect(moveNumberOfPlyFrom(2, 'white', 1)).toBe(2);
	});

	it('numbers plies from a Black start at a given fullmove', () => {
		// Black to move on move 21: ply 0 is 21…, ply 1 is 22.
		expect(moveNumberOfPlyFrom(0, 'black', 21)).toBe(21);
		expect(moveNumberOfPlyFrom(1, 'black', 21)).toBe(22);
	});
});

describe('plyLabel', () => {
	it('formats White and Black plies', () => {
		expect(plyLabel(0, 'white', 1)).toBe('1.');
		expect(plyLabel(1, 'white', 1)).toBe('1…');
		expect(plyLabel(0, 'black', 21)).toBe('21…');
		expect(plyLabel(1, 'black', 21)).toBe('22.');
	});
});

describe('Game.reset with a prelude', () => {
	/** Play SANs from the start position into the trainer's move shape. */
	function playedMoves(sans: string[]): PlayedMove[] {
		const chess = new Chess();
		return sans.map((san) => {
			const before = chess.fen();
			const m = chess.move(san);
			return { san: m.san, uci: m.from + m.to + (m.promotion ?? ''), fenBefore: before, fenAfter: chess.fen() };
		});
	}

	it('seeds browsable history and numbers moves from the prelude start', () => {
		const prelude = playedMoves(['e4', 'e5', 'Nf3']);
		const game = new Game();
		game.reset(prelude[2].fenAfter, prelude);
		expect(game.history).toHaveLength(3);
		expect(game.basePly).toBe(3);
		expect(game.fen).toBe(prelude[2].fenAfter);
		// Numbering starts at the original game's start, not the practice FEN.
		expect(game.initialTurn).toBe('white');
		expect(game.initialMoveNumber).toBe(1);
		expect(game.plyLabel(3)).toBe('2…');
	});

	it('appends new moves after the prelude and never undoes into it', () => {
		const prelude = playedMoves(['e4', 'e5']);
		const game = new Game();
		game.reset(prelude[1].fenAfter, prelude);
		expect(game.move('g1', 'f3')).not.toBeNull();
		expect(game.history).toHaveLength(3);
		game.undo(5); // asks for more than was played — must stop at the prelude
		expect(game.history).toHaveLength(2);
		expect(game.fen).toBe(prelude[1].fenAfter);
	});

	it('a plain reset clears the prelude boundary', () => {
		const prelude = playedMoves(['e4']);
		const game = new Game();
		game.reset(prelude[0].fenAfter, prelude);
		game.reset();
		expect(game.basePly).toBe(0);
		expect(game.history).toHaveLength(0);
	});
});

describe('turnOfFen', () => {
	it('reads the side to move from a FEN', () => {
		expect(turnOfFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('white');
		expect(turnOfFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1')).toBe('black');
	});
});
