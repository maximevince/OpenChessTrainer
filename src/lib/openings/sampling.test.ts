import { describe, expect, it } from 'vitest';
import { pickMove, temperatureFor, MIN_TEMPERATURE, MAX_TEMPERATURE } from './sampling';
import type { BookNode } from './types';

function node(uci: string, weight: number, forced = false): BookNode {
	return { uci, san: uci, weight, forced, children: [] };
}

/** Deterministic LCG for reproducible distribution tests. */
function seededRng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

describe('temperatureFor', () => {
	it('maps 0 to deterministic', () => {
		expect(temperatureFor(0)).toBe(0);
	});

	it('maps (0,1] into [MIN, MAX]', () => {
		expect(temperatureFor(1)).toBeCloseTo(MAX_TEMPERATURE);
		expect(temperatureFor(0.001)).toBeGreaterThanOrEqual(MIN_TEMPERATURE);
	});
});

describe('pickMove', () => {
	it('returns null for empty children', () => {
		expect(pickMove([], 0)).toBeNull();
	});

	it('t=0 always picks the most popular move', () => {
		const children = [node('e2e4', 500), node('d2d4', 900), node('g1f3', 100)];
		for (let i = 0; i < 20; i++) {
			expect(pickMove(children, 0, seededRng(i))?.uci).toBe('d2d4');
		}
	});

	it('drops children below 1% of the max weight', () => {
		const children = [node('d2d4', 10000), node('a2a3', 5)];
		const rng = seededRng(42);
		for (let i = 0; i < 200; i++) {
			expect(pickMove(children, MAX_TEMPERATURE, rng)?.uci).toBe('d2d4');
		}
	});

	it('keeps forced children regardless of weight', () => {
		const children = [node('d2d4', 10000), node('a2a3', 1, true)];
		const rng = seededRng(7);
		const picked = new Set<string>();
		for (let i = 0; i < 2000; i++) picked.add(pickMove(children, MAX_TEMPERATURE, rng)!.uci);
		expect(picked.has('a2a3')).toBe(true);
	});

	it('seeded sampling distribution roughly follows weights at t=1', () => {
		const children = [node('a', 750), node('b', 250)];
		const rng = seededRng(123);
		const counts: Record<string, number> = { a: 0, b: 0 };
		const n = 5000;
		for (let i = 0; i < n; i++) counts[pickMove(children, 1, rng)!.uci]++;
		// At t=1, p ∝ weight → expect ~75/25 (±5%).
		expect(counts.a / n).toBeGreaterThan(0.7);
		expect(counts.a / n).toBeLessThan(0.8);
	});

	it('low temperature sharpens toward the top move', () => {
		const children = [node('a', 600), node('b', 400)];
		const rng = seededRng(99);
		let a = 0;
		const n = 2000;
		for (let i = 0; i < n; i++) if (pickMove(children, MIN_TEMPERATURE, rng)!.uci === 'a') a++;
		// (600/400)^(1/0.3) ≈ 3.9 → a picked ~80% of the time; well above its 60% base rate.
		expect(a / n).toBeGreaterThan(0.72);
	});
});
