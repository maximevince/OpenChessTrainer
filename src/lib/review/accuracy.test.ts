import { describe, expect, it } from 'vitest';
import {
	classifyByWinDrop,
	gameAccuracy,
	moveAccuracy,
	volatilityWeights,
	winPct,
	winPctFor
} from './accuracy';

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
	it('blends volatility-weighted and harmonic means (below the plain mean)', () => {
		// weighted mean 75, harmonic mean 66.67 → (75 + 66.67) / 2 ≈ 70.83.
		expect(gameAccuracy([100, 50])).toBeCloseTo(70.83, 1);
		expect(gameAccuracy([])).toBe(100);
	});

	it('is dragged down hard by a single low move (harmonic mean)', () => {
		const acc = gameAccuracy([100, 100, 100, 100, 5]);
		expect(acc).toBeLessThan(70); // a plain mean would read 82
	});

	it('honors per-move weights in the weighted half', () => {
		const flat = gameAccuracy([100, 60]);
		const heavyOnGood = gameAccuracy([100, 60], [10, 1]);
		expect(heavyOnGood).toBeGreaterThan(flat);
	});
});

describe('volatilityWeights', () => {
	it('returns one weight per move, clamped to [0.5, 12]', () => {
		const winPcts = [50, 55, 40, 70, 30, 60, 45, 50, 52, 48, 51];
		const w = volatilityWeights(winPcts);
		expect(w).toHaveLength(winPcts.length - 1);
		for (const x of w) {
			expect(x).toBeGreaterThanOrEqual(0.5);
			expect(x).toBeLessThanOrEqual(12);
		}
	});

	it('weighs volatile stretches above calm ones', () => {
		const winPcts = [50, 50, 50, 50, 50, 50, 20, 80, 20, 80, 50];
		const w = volatilityWeights(winPcts);
		const calm = w[0];
		const volatile = Math.max(...w);
		expect(volatile).toBeGreaterThan(calm);
	});
});

describe('classifyByWinDrop', () => {
	it('maps drops to qualities at the boundaries', () => {
		expect(classifyByWinDrop(50, 49)).toBe('excellent');
		expect(classifyByWinDrop(50, 46)).toBe('good');
		expect(classifyByWinDrop(50, 41)).toBe('inaccuracy');
		expect(classifyByWinDrop(50, 31)).toBe('mistake');
		expect(classifyByWinDrop(50, 25)).toBe('blunder');
	});

	it('improving moves are excellent (not "best" — that needs the top move)', () => {
		expect(classifyByWinDrop(40, 60)).toBe('excellent');
	});
});
