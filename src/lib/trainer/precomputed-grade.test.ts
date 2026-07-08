import { describe, expect, it } from 'vitest';
import { toEvalScore, precomputedEvals } from './precomputed-grade';
import { classifyMove } from './classify';

describe('toEvalScore', () => {
	it('carries cp and the best move', () => {
		expect(toEvalScore({ cp: 34, bestUci: 'e2e4' })).toEqual({ cp: 34, bestUci: 'e2e4' });
	});

	it('prefers mate over cp and reports a null best move when absent', () => {
		expect(toEvalScore({ mate: -2 })).toEqual({ mate: -2, bestUci: null });
		expect(toEvalScore({ mate: 3, cp: 999 })).toEqual({ mate: 3, bestUci: null });
	});
});

describe('precomputedEvals', () => {
	it('is null unless both parent and child are annotated', () => {
		expect(precomputedEvals(undefined, { cp: 0 })).toBeNull();
		expect(precomputedEvals({ cp: 0 }, undefined)).toBeNull();
	});

	it('pairs the parent (before) and child (after) evals', () => {
		const pre = precomputedEvals({ cp: 20, bestUci: 'g1f3' }, { cp: -180 });
		expect(pre).toEqual({
			before: { cp: 20, bestUci: 'g1f3' },
			after: { cp: -180, bestUci: null }
		});
	});

	it('feeds classifyMove exactly as a live probe would', () => {
		// White to move at +0.2 with best g1f3; instead drops to -4.0 for White.
		const pre = precomputedEvals({ cp: 20, bestUci: 'g1f3' }, { cp: -400 })!;
		expect(classifyMove(pre.before, pre.after, 'white', 'b1a3')).toBe('blunder');
		// Playing the annotated best move is graded "best" by move identity.
		expect(classifyMove(pre.before, pre.after, 'white', 'g1f3')).toBe('best');
	});
});
