import { describe, expect, it } from 'vitest';
import { classifyByWinDrop, gameAccuracy, moveAccuracy, winPct, winPctFor } from './accuracy';

describe('winPct', () => {
	it('is 50% for an equal position', () => {
		expect(winPct({ cp: 0 })).toBeCloseTo(50);
	});

	it('is ~59% at +100cp', () => {
		expect(winPct({ cp: 100 })).toBeGreaterThan(58);
		expect(winPct({ cp: 100 })).toBeLessThan(60);
	});

	it('clamps beyond ±1000cp', () => {
		expect(winPct({ cp: 5000 })).toBeCloseTo(winPct({ cp: 1000 }));
	});

	it('treats mates as clamped evals', () => {
		expect(winPct({ mate: 3 })).toBeCloseTo(winPct({ cp: 1000 }));
		expect(winPct({ mate: -2 })).toBeCloseTo(winPct({ cp: -1000 }));
	});

	it('flips for black', () => {
		expect(winPctFor({ cp: 100 }, 'black')).toBeCloseTo(100 - winPct({ cp: 100 }));
	});
});

describe('moveAccuracy', () => {
	it('is ~100 for no drop', () => {
		expect(moveAccuracy(50, 50)).toBeCloseTo(100, 0);
	});

	it('decreases with the drop and clamps to [0,100]', () => {
		expect(moveAccuracy(80, 60)).toBeLessThan(moveAccuracy(80, 75));
		expect(moveAccuracy(99, 1)).toBeGreaterThanOrEqual(0);
		expect(moveAccuracy(40, 60)).toBeLessThanOrEqual(100); // improving move
	});
});

describe('gameAccuracy', () => {
	it('averages move accuracies', () => {
		expect(gameAccuracy([100, 50])).toBeCloseTo(75);
		expect(gameAccuracy([])).toBe(100);
	});
});

describe('classifyByWinDrop', () => {
	it('maps drops to qualities at the boundaries', () => {
		expect(classifyByWinDrop(50, 49)).toBe('best');
		expect(classifyByWinDrop(50, 46)).toBe('good');
		expect(classifyByWinDrop(50, 41)).toBe('inaccuracy');
		expect(classifyByWinDrop(50, 31)).toBe('mistake');
		expect(classifyByWinDrop(50, 25)).toBe('blunder');
	});

	it('improving moves are best', () => {
		expect(classifyByWinDrop(40, 60)).toBe('best');
	});
});
