import { describe, expect, it } from 'vitest';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { explainMove, numberedLine } from './explain';

/** FEN after playing the given UCI moves from the start position. */
function fenAfter(...ucis: string[]): string {
	const chess = new Chess();
	for (const uci of ucis) {
		chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined });
	}
	return chess.fen();
}

describe('numberedLine', () => {
	it('numbers a line starting with White', () => {
		expect(numberedLine(DEFAULT_POSITION, ['e2e4', 'e7e5', 'g1f3'])).toBe('1.e4 e5 2.Nf3');
	});

	it('prefixes a line starting with Black with "N..."', () => {
		expect(numberedLine(fenAfter('e2e4'), ['e7e5', 'g1f3', 'b8c6'])).toBe('1...e5 2.Nf3 Nc6');
	});

	it('truncates to maxPlies', () => {
		expect(numberedLine(DEFAULT_POSITION, ['e2e4', 'e7e5', 'g1f3', 'b8c6'], 2)).toBe('1.e4 e5');
	});

	it('keeps the legal prefix when the pv goes illegal mid-line', () => {
		expect(numberedLine(DEFAULT_POSITION, ['e2e4', 'e2e4'])).toBe('1.e4');
	});

	it('returns null when nothing in the pv is legal', () => {
		expect(numberedLine(DEFAULT_POSITION, ['e2e5'])).toBeNull();
		expect(numberedLine(DEFAULT_POSITION, [])).toBeNull();
	});
});

describe('explainMove', () => {
	// 1.f3 e5 2.g4?? — best was anything else; Black punishes with 2...Qh4#.
	const played = {
		fenBefore: fenAfter('f2f3', 'e7e5'),
		fenAfter: fenAfter('f2f3', 'e7e5', 'g2g4'),
		uci: 'g2g4'
	};

	it('names the missed best move and the punish line', () => {
		const e = explainMove(played, { bestUci: 'g1h3', pv: ['g1h3'] }, { pv: ['d8h4'] });
		expect(e).toEqual({
			bestSan: 'Nh3',
			bestUci: 'g1h3',
			refutationLine: '2...Qh4#',
			refutationUci: 'd8h4'
		});
	});

	it('omits the best move when it is the move that was played', () => {
		const e = explainMove(played, { bestUci: 'g2g4' }, { pv: ['d8h4'] });
		expect(e?.bestSan).toBeNull();
		expect(e?.bestUci).toBeNull();
		expect(e?.refutationLine).toBe('2...Qh4#');
	});

	it('survives a terminal after-position (no pv): best move only', () => {
		const e = explainMove(played, { bestUci: 'g1h3' }, {});
		expect(e).toEqual({
			bestSan: 'Nh3',
			bestUci: 'g1h3',
			refutationLine: null,
			refutationUci: null
		});
	});

	it('returns null when the evals carry nothing to show', () => {
		expect(explainMove(played, { bestUci: 'g2g4' }, { pv: [] })).toBeNull();
		expect(explainMove(played, {}, {})).toBeNull();
	});

	it('ignores a stale pv that no longer fits the position', () => {
		const e = explainMove(played, { bestUci: 'g1h3' }, { pv: ['a1a5'] });
		expect(e?.refutationLine).toBeNull();
		expect(e?.refutationUci).toBeNull();
	});
});
