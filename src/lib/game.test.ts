import { describe, expect, it } from 'vitest';
import { colorOfPlyFrom, moveNumberOfPlyFrom, plyLabel, turnOfFen } from './game.svelte';

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

describe('turnOfFen', () => {
	it('reads the side to move from a FEN', () => {
		expect(turnOfFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('white');
		expect(turnOfFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1')).toBe('black');
	});
});
