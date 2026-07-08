import { describe, expect, it } from 'vitest';
import { OPENINGS } from '../../../scripts/openings.config';

/**
 * Config-level guards on the hand-named lines, focused on two engine-verified
 * gotchas that a careless edit could silently break (both wrong moves look
 * natural and both lose).
 */

const spec = (id: string) => {
	const found = OPENINGS.find((s) => s.id === id);
	if (!found) throw new Error(`no spec ${id}`);
	return found;
};

describe('bishop-scholar gotchas', () => {
	const lines = spec('bishop-scholar').namedLines!;

	it('vs 5.Qd1 the retreat is 7...Nc6! - Bxf5?? only works vs Qd3', () => {
		const qd1 = lines.find((l) => l.name.includes('5.Qd1'))!;
		expect(qd1.moves).toContain('Qd1');
		expect(qd1.moves.at(-1)).toBe('Nc6');
		expect(qd1.moves).not.toContain('Bxf5');
		// The Bxf5 trick belongs to the Qd3 branch only.
		const qd3 = lines.find((l) => l.name.includes('punish 5.Qd3'))!;
		expect(qd3.moves).toContain('Qd3');
		expect(qd3.moves.at(-1)).toBe('Bxf5');
	});

	it('after 7.exf6 the mate needs Bxf3 FIRST (immediate Qd1+?? loses to Qxd1)', () => {
		const line = lines.find((l) => l.moves.includes('exf6'))!;
		expect(line.moves[line.moves.indexOf('exf6') + 1]).toBe('Bxf3');
		expect(line.moves.indexOf('Qd1#')).toBeGreaterThan(line.moves.indexOf('Bxf3'));
	});
});

describe('named-line invariants', () => {
	it('never endorses a trap line', () => {
		for (const s of OPENINGS) {
			for (const l of s.namedLines ?? []) {
				if (l.trap) expect(l.recommend, `${s.id}: ${l.name}`).toBeUndefined();
			}
		}
	});

	it('lists each punish group mainline before its traps (trap-flag placement)', () => {
		// ensureLine flags the first FRESH erring-side move; if a trap line ran
		// first it would claim a shared prefix move (e.g. 5.exf5) as the trap.
		const groups = [
			{ id: 'wayward-queen', group: 'Punish with 4...f5' },
			{ id: 'bishop-scholar', group: 'Rousseau Counter 3...f5' },
			{ id: 'bishop-scholar', group: 'Pirc anti-prep' }
		];
		for (const { id, group } of groups) {
			const lines = spec(id).namedLines!.filter((l) => l.group === group);
			expect(lines.length, `${id}: ${group}`).toBeGreaterThan(1);
			expect(lines[0].kind, `${id}: ${group}`).toBe('mainline');
			expect(lines[0].trap, `${id}: ${group}`).toBeUndefined();
		}
	});
});
