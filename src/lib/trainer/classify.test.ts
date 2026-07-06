import { describe, expect, it } from 'vitest';
import { classifyMove, formatEval, toSideCp } from './classify';

describe('toSideCp', () => {
	it('keeps white perspective for white', () => {
		expect(toSideCp({ cp: 50 }, 'white')).toBe(50);
	});

	it('flips for black', () => {
		expect(toSideCp({ cp: 50 }, 'black')).toBe(-50);
		expect(toSideCp({ cp: -80 }, 'black')).toBe(80);
	});

	it('maps mates beyond the cp scale, closer mate = stronger', () => {
		expect(toSideCp({ mate: 2 }, 'white')).toBeGreaterThan(9000);
		expect(toSideCp({ mate: 2 }, 'white')).toBeGreaterThan(toSideCp({ mate: 5 }, 'white'));
		expect(toSideCp({ mate: -3 }, 'white')).toBeLessThan(-9000);
		// White mates in 2 = Black is getting mated → very negative for Black.
		expect(toSideCp({ mate: 2 }, 'black')).toBeLessThan(-9000);
	});
});

describe('classifyMove', () => {
	it('reserves "best" for playing the engine top move, regardless of eval swing', () => {
		expect(classifyMove({ cp: 30, bestUci: 'g1f3' }, { cp: 25 }, 'white', 'g1f3')).toBe('best');
		// Even a noisy after-eval cannot demote the engine's own move.
		expect(classifyMove({ cp: 30, bestUci: 'g1f3' }, { cp: -40 }, 'white', 'g1f3')).toBe('best');
	});

	it('grades a non-top move by eval swing, never as "best"', () => {
		expect(classifyMove({ cp: 30, bestUci: 'g1f3' }, { cp: 25 }, 'white', 'b1c3')).toBe(
			'excellent'
		);
	});

	it('thresholds for white', () => {
		expect(classifyMove({ cp: 30 }, { cp: 25 }, 'white')).toBe('excellent');
		expect(classifyMove({ cp: 30 }, { cp: -20 }, 'white')).toBe('good');
		expect(classifyMove({ cp: 30 }, { cp: -80 }, 'white')).toBe('inaccuracy');
		expect(classifyMove({ cp: 30 }, { cp: -200 }, 'white')).toBe('mistake');
		expect(classifyMove({ cp: 30 }, { cp: -300 }, 'white')).toBe('blunder');
	});

	it('perspective flip: same numbers, black mover', () => {
		// White-perspective eval went from +30 to +300 → great for White, blunder by Black.
		expect(classifyMove({ cp: 30 }, { cp: 300 }, 'black')).toBe('blunder');
		// Eval dropped for White → that was a fine move for Black.
		expect(classifyMove({ cp: 30 }, { cp: -50 }, 'black')).toBe('excellent');
	});

	it('an improving move is at least excellent', () => {
		expect(classifyMove({ cp: -100 }, { cp: 100 }, 'white')).toBe('excellent');
	});

	it('throwing away a forced mate is a blunder', () => {
		expect(classifyMove({ mate: 3 }, { cp: 500 }, 'white')).toBe('blunder');
	});

	it('allowing a mate is a blunder', () => {
		expect(classifyMove({ cp: -200 }, { mate: 4 }, 'black')).toBe('blunder');
		expect(classifyMove({ cp: 200 }, { mate: -4 }, 'white')).toBe('blunder');
	});

	it('keeping a forced mate (even a slower one) is excellent', () => {
		expect(classifyMove({ mate: 2 }, { mate: 4 }, 'white')).toBe('excellent');
	});

	it('mate for the mover is not a blunder', () => {
		expect(classifyMove({ cp: 800 }, { mate: 2 }, 'white')).toBe('excellent');
	});
});

describe('formatEval', () => {
	it('formats cp as pawns', () => {
		expect(formatEval({ cp: 35 })).toBe('+0.35');
		expect(formatEval({ cp: -120 })).toBe('-1.20');
		expect(formatEval({ cp: 0 })).toBe('+0.00');
	});

	it('formats mates', () => {
		expect(formatEval({ mate: 3 })).toBe('#3');
		expect(formatEval({ mate: -2 })).toBe('#-2');
	});
});
