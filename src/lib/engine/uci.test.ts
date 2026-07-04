import { describe, expect, it } from 'vitest';
import { normalizeToWhite, parseBestMove, parseInfoLine } from './uci';

describe('normalizeToWhite', () => {
	it('keeps score as-is when white to move', () => {
		expect(normalizeToWhite({ cp: 35 }, 'w')).toEqual({ cp: 35, mate: undefined });
		expect(normalizeToWhite({ mate: 3 }, 'w')).toEqual({ mate: 3 });
	});

	it('flips cp when black to move', () => {
		expect(normalizeToWhite({ cp: 35 }, 'b')).toEqual({ cp: -35, mate: undefined });
		expect(normalizeToWhite({ cp: -120 }, 'b')).toEqual({ cp: 120, mate: undefined });
	});

	it('flips mate when black to move', () => {
		// Black to move, engine says side-to-move mates in 2 → Black mates → -2 for White.
		expect(normalizeToWhite({ mate: 2 }, 'b')).toEqual({ cp: undefined, mate: -2 });
		expect(normalizeToWhite({ mate: -1 }, 'b')).toEqual({ cp: undefined, mate: 1 });
	});

	it('handles zero cp (avoids -0 weirdness in comparisons)', () => {
		const flipped = normalizeToWhite({ cp: 0 }, 'b');
		expect(flipped.cp === 0).toBe(true);
	});
});

describe('parseInfoLine', () => {
	it('parses a cp score with pv', () => {
		const line =
			'info depth 20 seldepth 28 multipv 1 score cp 31 nodes 500000 nps 800000 time 625 pv e2e4 e7e5 g1f3';
		expect(parseInfoLine(line)).toEqual({
			depth: 20,
			score: { cp: 31 },
			pv: ['e2e4', 'e7e5', 'g1f3']
		});
	});

	it('parses a mate score', () => {
		const line = 'info depth 12 score mate -3 nodes 1000 time 5 pv d8h4 g2g3 h4g3';
		expect(parseInfoLine(line)).toEqual({
			depth: 12,
			score: { mate: -3 },
			pv: ['d8h4', 'g2g3', 'h4g3']
		});
	});

	it('parses promotion moves in pv', () => {
		const line = 'info depth 5 score cp 900 pv e7e8q a7a8n';
		expect(parseInfoLine(line)?.pv).toEqual(['e7e8q', 'a7a8n']);
	});

	it('ignores bound scores', () => {
		expect(
			parseInfoLine('info depth 10 score cp 50 lowerbound nodes 100 pv e2e4')
		).toBeNull();
	});

	it('ignores lines without pv or score', () => {
		expect(parseInfoLine('info depth 10 currmove e2e4 currmovenumber 1')).toBeNull();
		expect(parseInfoLine('info string NNUE evaluation using nn.nnue')).toBeNull();
		expect(parseInfoLine('bestmove e2e4')).toBeNull();
	});
});

describe('parseBestMove', () => {
	it('parses bestmove with ponder', () => {
		expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({ uci: 'e2e4' });
	});

	it('parses bestmove promotion', () => {
		expect(parseBestMove('bestmove e7e8q')).toEqual({ uci: 'e7e8q' });
	});

	it('maps (none) to null uci', () => {
		expect(parseBestMove('bestmove (none)')).toEqual({ uci: null });
	});

	it('returns null for non-bestmove lines', () => {
		expect(parseBestMove('info depth 1 score cp 0 pv e2e4')).toBeNull();
	});
});
