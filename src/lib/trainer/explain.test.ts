import { describe, expect, it } from 'vitest';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { detectMotif, explainMove, motifText, numberedLine } from './explain';

/** FEN after playing the given UCI moves from the start position. */
function fenAfter(...ucis: string[]): string {
	const chess = new Chess();
	for (const uci of ucis) {
		chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined });
	}
	return chess.fen();
}

/** FEN after playing one UCI move from an arbitrary FEN. */
function fenPlus(fen: string, uci: string): string {
	const chess = new Chess(fen);
	chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined });
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

	it('names the missed best move, the punish line, and the allowed mate', () => {
		const e = explainMove(played, { bestUci: 'g1h3', pv: ['g1h3'] }, { mate: -1, pv: ['d8h4'] }, 'white');
		expect(e).toEqual({
			bestSan: 'Nh3',
			bestUci: 'g1h3',
			refutationLine: '2...Qh4#',
			refutationUci: 'd8h4',
			motif: { kind: 'allows-mate', mateIn: 1 },
			reason: 'This allows immediate checkmate.'
		});
	});

	it('omits the best move when it is the move that was played', () => {
		const e = explainMove(played, { bestUci: 'g2g4' }, { pv: ['d8h4'] }, 'white');
		expect(e?.bestSan).toBeNull();
		expect(e?.bestUci).toBeNull();
		expect(e?.refutationLine).toBe('2...Qh4#');
	});

	it('survives a terminal after-position (no pv): best move only', () => {
		const e = explainMove(played, { bestUci: 'g1h3' }, {}, 'white');
		expect(e?.bestSan).toBe('Nh3');
		expect(e?.refutationLine).toBeNull();
		expect(e?.motif).toBeNull();
	});

	it('returns null when the evals carry nothing to show', () => {
		expect(explainMove(played, { bestUci: 'g2g4' }, { pv: [] }, 'white')).toBeNull();
		expect(explainMove(played, {}, {}, 'white')).toBeNull();
	});

	it('ignores a stale pv that no longer fits the position', () => {
		const e = explainMove(played, { bestUci: 'g1h3' }, { pv: ['a1a5'] }, 'white');
		expect(e?.refutationLine).toBeNull();
		expect(e?.motif).toBeNull();
	});

	it('folds the mating move into a missed-mate reason instead of "Best was"', () => {
		const e = explainMove(played, { bestUci: 'g1h3', mate: 3 }, { cp: 200, pv: [] }, 'white');
		expect(e?.motif).toEqual({ kind: 'missed-mate', mateIn: 3 });
		expect(e?.reason).toBe('You missed a forced mate in 3 starting with Nh3.');
	});
});

describe('detectMotif', () => {
	const anyPlayed = {
		fenBefore: fenAfter('f2f3', 'e7e5'),
		fenAfter: fenAfter('f2f3', 'e7e5', 'g2g4'),
		uci: 'g2g4'
	};

	it('reads mate signs from the user side (Black user, White mates)', () => {
		expect(detectMotif(anyPlayed, {}, { mate: 2 }, 'black')).toEqual({
			kind: 'allows-mate',
			mateIn: 2
		});
	});

	it('does not report allows-mate when the user was already lost', () => {
		expect(detectMotif(anyPlayed, { mate: -5 }, { mate: -3 }, 'white')).toBeNull();
	});

	it('detects a hung piece the user just moved (2.Qh5?? gxh5)', () => {
		const played = {
			fenBefore: fenAfter('e2e4', 'g7g6'),
			fenAfter: fenAfter('e2e4', 'g7g6', 'd1h5'),
			uci: 'd1h5'
		};
		const motif = detectMotif(played, {}, { pv: ['g6h5', 'b1c3'] }, 'white');
		expect(motif).toEqual({ kind: 'hangs-piece', piece: 'q', square: 'h5', justMoved: true });
		expect(motifText(motif)).toBe('This hangs your queen on h5.');
	});

	it('detects a piece left hanging elsewhere (moved a2a3, knight falls)', () => {
		const fen = '4k3/8/3p4/4N3/8/8/P7/4K3 w - - 0 1';
		const played = { fenBefore: fen, fenAfter: fenPlus(fen, 'a2a3'), uci: 'a2a3' };
		const motif = detectMotif(played, {}, { pv: ['d6e5', 'a3a4'] }, 'white');
		expect(motif).toEqual({ kind: 'hangs-piece', piece: 'n', square: 'e5', justMoved: false });
		expect(motifText(motif)).toBe('This leaves your knight on e5 hanging.');
	});

	it('does not trust material counting when the pv ends mid-exchange', () => {
		const played = {
			fenBefore: fenAfter('e2e4', 'g7g6'),
			fenAfter: fenAfter('e2e4', 'g7g6', 'd1h5'),
			uci: 'd1h5'
		};
		// Same hung queen, but the pv is cut off right at the capture.
		expect(detectMotif(played, {}, { pv: ['g6h5'] }, 'white')).toBeNull();
	});

	it('detects a knight fork of king and rook (Nc2+)', () => {
		const fen = '4k3/8/8/8/1n6/8/8/R3K3 b - - 0 1';
		const played = { fenBefore: fen, fenAfter: fen, uci: 'e1e1' };
		const motif = detectMotif(played, {}, { pv: ['b4c2', 'e1e2', 'c2a1', 'e2d2'] }, 'white');
		expect(motif).toEqual({ kind: 'fork', san: 'Nc2+', targets: ['k', 'r'] });
		expect(motifText(motif)).toBe('Nc2+ forks your king and rook.');
	});

	it('detects losing the exchange (rook for bishop)', () => {
		const fen = '4k3/8/8/8/6b1/8/8/3RK3 b - - 0 1';
		const played = { fenBefore: fen, fenAfter: fen, uci: 'e1e1' };
		const motif = detectMotif(played, {}, { pv: ['g4d1', 'e1d1', 'e8e7'] }, 'white');
		expect(motif).toEqual({ kind: 'loses-material', lost: ['r'], won: ['b'], net: -2 });
		expect(motifText(motif)).toBe('This loses the exchange.');
	});
});

describe('motifText', () => {
	it('names an uncompensated loss with what came back', () => {
		expect(motifText({ kind: 'loses-material', lost: ['q'], won: ['r'], net: -4 })).toBe(
			'This loses your queen for a rook.'
		);
	});

	it('cancels equal trades and names the heaviest remaining loss', () => {
		expect(
			motifText({ kind: 'loses-material', lost: ['n', 'b'], won: ['n'], net: -3 })
		).toBe('This loses your bishop.');
	});

	it('counts plain pawn losses', () => {
		expect(motifText({ kind: 'loses-material', lost: ['p', 'p'], won: [], net: -2 })).toBe(
			'This loses 2 pawns.'
		);
	});

	it('pluralizes double fork targets', () => {
		expect(motifText({ kind: 'fork', san: 'Ne6', targets: ['r', 'r'] })).toBe(
			'Ne6 forks your two rooks.'
		);
	});
});
