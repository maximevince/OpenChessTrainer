import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { PlayedMove } from '$lib/game.svelte';
import { buildGameReport, type PositionEval } from './analyse';

function play(ucis: string[]): PlayedMove[] {
	const chess = new Chess();
	const out: PlayedMove[] = [];
	for (const uci of ucis) {
		const fenBefore = chess.fen();
		const m = chess.move({
			from: uci.slice(0, 2),
			to: uci.slice(2, 4),
			promotion: uci.slice(4, 5) || undefined
		});
		out.push({ san: m.san, uci: m.from + m.to + (m.promotion ?? ''), fenBefore, fenAfter: chess.fen() });
	}
	return out;
}

describe('buildGameReport explanations', () => {
	it('adds PV-based explanations to flagged non-book moves', () => {
		const moves = play(['f2f3', 'e7e5', 'g2g4']);
		const evals: PositionEval[] = [
			{ cp: 0, bestUci: 'e2e4', pv: ['e2e4'] },
			{ cp: 0, bestUci: 'e7e5', pv: ['e7e5'] },
			{ cp: 0, bestUci: 'g1h3', pv: ['g1h3'] },
			{ mate: -1, bestUci: 'd8h4', pv: ['d8h4'] }
		];

		const report = buildGameReport(moves, evals, 0);
		const flagged = report.moves[2];

		expect(flagged.quality).toBe('blunder');
		expect(flagged.explain?.bestLine[0]?.uci).toBe('g1h3');
		expect(flagged.explain?.refutation[0]?.uci).toBe('d8h4');
		expect(flagged.explain?.reason).toContain('mate');
	});

	it('does not explain book moves even when the eval would flag them', () => {
		const moves = play(['f2f3']);
		const evals: PositionEval[] = [
			{ cp: 0, bestUci: 'e2e4', pv: ['e2e4'] },
			{ cp: -500, bestUci: 'e7e5', pv: ['e7e5'] }
		];

		const report = buildGameReport(moves, evals, 1);

		expect(report.moves[0].quality).toBe('book');
		expect(report.moves[0].explain).toBeUndefined();
	});

	it('does not explain unflagged moves', () => {
		const moves = play(['e2e4']);
		const evals: PositionEval[] = [
			{ cp: 0, bestUci: 'e2e4', pv: ['e2e4'] },
			{ cp: 0, bestUci: 'e7e5', pv: ['e7e5'] }
		];

		const report = buildGameReport(moves, evals, 0);

		expect(report.moves[0].quality).toBe('best');
		expect(report.moves[0].explain).toBeUndefined();
	});
});
