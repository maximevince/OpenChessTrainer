import { describe, expect, it } from 'vitest';
import { chooseHint } from './hint';
import type { EvalScore } from '$lib/engine/uci';

/** White-perspective eval with a best move. */
function pos(cp: number, bestUci: string | null): EvalScore & { bestUci: string | null } {
	return { cp, bestUci };
}

describe('chooseHint (hint quality gate)', () => {
	it('trusts a book move that is the engine\'s own best move (green, no after-eval needed)', () => {
		const best = pos(30, 'g8f6');
		expect(chooseHint('g8f6', best, null, 'black')).toEqual({ uci: 'g8f6', source: 'book' });
	});

	it('trusts a book move the engine rates only slightly worse (still "good")', () => {
		// Black to move: before -30cp (White +30), after -80cp → loss 50 for Black = "good".
		const best = pos(30, 'f8c5');
		const after: EvalScore = { cp: 80 };
		expect(chooseHint('c8e6', best, after, 'black')).toEqual({ uci: 'c8e6', source: 'book' });
	});

	it('rejects a popular-but-losing book move and hints the engine best instead (the Be6 case)', () => {
		// Black plays 8...Be6?? the engine best is 8...Bc5. After Be6, 9.Nxe6 wins a piece:
		// White eval jumps from +0.3 to +3.0 → Black loses ~270cp = blunder.
		const best = pos(30, 'f8c5'); // engine best = Bc5
		const afterBe6: EvalScore = { cp: 300 }; // White +3 after Be6
		expect(chooseHint('c8e6', best, afterBe6, 'black')).toEqual({ uci: 'f8c5', source: 'engine' });
	});

	it('rejects a book move that is a "mistake" (loss > 120cp), not only outright blunders', () => {
		const best = pos(170, 'd2d4'); // engine best keeps White at +1.7
		const afterBookMove: EvalScore = { cp: 20 }; // book move drops it to +0.2 → loss 150 = mistake
		expect(chooseHint('a2a3', best, afterBookMove, 'white')).toEqual({ uci: 'd2d4', source: 'engine' });
	});

	it('rejects a book move that walks into a forced mate', () => {
		const best = pos(50, 'e1g1');
		const afterBookMove: EvalScore = { mate: -2 }; // White gets mated in 2 after the book move
		expect(chooseHint('f1e2', best, afterBookMove, 'white')).toEqual({ uci: 'e1g1', source: 'engine' });
	});

	it('hints the engine best when the position is out of book (no top move)', () => {
		const best = pos(-40, 'c7c5');
		expect(chooseHint(null, best, null, 'black')).toEqual({ uci: 'c7c5', source: 'engine' });
	});

	it('labels the corrected move "book" (green) when the engine best is itself a book move', () => {
		// Popular Be6 is a blunder; engine best Bc5 (f8c5) is an unpopular *book* move → keep it green.
		const best = pos(30, 'f8c5');
		const afterBe6: EvalScore = { cp: 300 };
		const bookUcis = ['c8e6', 'f6d5', 'f8c5'];
		expect(chooseHint('c8e6', best, afterBe6, 'black', bookUcis)).toEqual({ uci: 'f8c5', source: 'book' });
	});

	it('keeps the book move if the engine somehow returns no best move', () => {
		const best = pos(0, null);
		expect(chooseHint('e2e4', best, null, 'white')).toEqual({ uci: 'e2e4', source: 'book' });
	});

	it('returns null when there is neither a book move nor an engine move', () => {
		expect(chooseHint(null, pos(0, null), null, 'white')).toBeNull();
	});
});
