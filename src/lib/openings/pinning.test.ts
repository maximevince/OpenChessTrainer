import { describe, expect, it } from 'vitest';
import { resolvePinnedMove, isOnPinnedLine, namedBranchesAt, mainLinePath } from './pinning';
import type { BookNode, OpeningVariation } from './types';

function node(uci: string, children: BookNode[] = [], weight = 1): BookNode {
	return { uci, san: uci, weight, children };
}

const forkNode = (...ucis: string[]) => ({ children: ucis.map((u) => node(u)) });

describe('resolvePinnedMove', () => {
	const pinned = ['e2e4', 'e7e5', 'd1h5'];

	it('returns null when no line is pinned', () => {
		expect(resolvePinnedMove(null, [], forkNode('e2e4'))).toBeNull();
	});

	it('returns the pinned next move at the start of the line', () => {
		expect(resolvePinnedMove(pinned, [], forkNode('e2e4', 'd2d4'))?.uci).toBe('e2e4');
	});

	it('follows the pinned move mid-line', () => {
		expect(resolvePinnedMove(pinned, ['e2e4', 'e7e5'], forkNode('d1h5', 'g1f3'))?.uci).toBe(
			'd1h5'
		);
	});

	it('returns null once the game diverges from the pinned prefix', () => {
		expect(resolvePinnedMove(pinned, ['d2d4'], forkNode('d7d5'))).toBeNull();
	});

	it('returns null past the pinned leaf (line exhausted)', () => {
		expect(resolvePinnedMove(pinned, pinned, forkNode('b8c6'))).toBeNull();
		expect(resolvePinnedMove(pinned, [...pinned, 'b8c6'], forkNode('f1c4'))).toBeNull();
	});

	it('returns null when the pinned move is not among the book children (transposition guard)', () => {
		expect(resolvePinnedMove(pinned, ['e2e4', 'e7e5'], forkNode('g1f3', 'f1c4'))).toBeNull();
	});
});

describe('isOnPinnedLine', () => {
	const pinned = ['e2e4', 'e7e5', 'd1h5'];

	it('is false with no pin', () => {
		expect(isOnPinnedLine(null, ['e2e4'])).toBe(false);
	});

	it('is true on a prefix (including the full line)', () => {
		expect(isOnPinnedLine(pinned, [])).toBe(true);
		expect(isOnPinnedLine(pinned, ['e2e4', 'e7e5'])).toBe(true);
		expect(isOnPinnedLine(pinned, pinned)).toBe(true);
	});

	it('is false after diverging or overrunning the line', () => {
		expect(isOnPinnedLine(pinned, ['d2d4'])).toBe(false);
		expect(isOnPinnedLine(pinned, [...pinned, 'b8c6'])).toBe(false);
	});
});

describe('mainLinePath', () => {
	it('returns played plus the leaf child itself', () => {
		expect(mainLinePath(['e2e4'], node('e7e5'))).toEqual(['e2e4', 'e7e5']);
	});

	it('follows the most popular continuation to a leaf', () => {
		const start = node('e7e5', [
			node('g1f3', [node('b8c6', [], 5)], 10),
			node('f1c4', [], 3)
		]);
		expect(mainLinePath(['e2e4'], start)).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
	});

	it('breaks weight ties deterministically on the first sibling', () => {
		const start = node('e7e5', [node('g1f3', [], 2), node('b1c3', [], 2)]);
		expect(mainLinePath([], start)).toEqual(['e7e5', 'g1f3']);
	});
});

describe('namedBranchesAt', () => {
	const variations: OpeningVariation[] = [
		{ name: 'Clean refutation', uci: ['e2e4', 'e7e5', 'd1h5', 'b8c6'] },
		{ name: 'Solid setup', uci: ['e2e4', 'e7e5', 'd1h5', 'g7g6'] },
		{ name: 'Unrelated', uci: ['d2d4', 'd7d5'] }
	];

	it('returns empty when there are no variations', () => {
		expect(namedBranchesAt(undefined, []).size).toBe(0);
	});

	it('maps each branch at the fork by its next uci', () => {
		const m = namedBranchesAt(variations, ['e2e4', 'e7e5', 'd1h5']);
		expect(m.get('b8c6')).toBe('Clean refutation');
		expect(m.get('g7g6')).toBe('Solid setup');
		expect(m.has('d7d5')).toBe(false); // different opening prefix
	});

	it('ignores variations that do not share the current prefix', () => {
		const m = namedBranchesAt(variations, ['d2d4']);
		expect(m.get('d7d5')).toBe('Unrelated');
		expect(m.has('b8c6')).toBe(false);
	});

	it('ignores variations already exhausted by the current path', () => {
		const m = namedBranchesAt(variations, ['d2d4', 'd7d5']);
		expect(m.size).toBe(0);
	});
});
