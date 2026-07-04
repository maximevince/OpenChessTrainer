import { describe, expect, it } from 'vitest';
import { terminalEval } from './terminal';

describe('terminalEval', () => {
	it('is null for ongoing positions', () => {
		expect(terminalEval('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBeNull();
	});

	it('checkmate: sign points at the winner', () => {
		// Fool's mate — white is mated, black delivered it.
		expect(
			terminalEval('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')
		).toEqual({ mate: -1 });
		// Scholar's mate — black is mated.
		expect(
			terminalEval('r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4')
		).toEqual({ mate: 1 });
	});

	it('stalemate is a dead-equal eval', () => {
		expect(terminalEval('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toEqual({ cp: 0 });
	});
});
