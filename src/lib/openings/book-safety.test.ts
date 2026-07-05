import { describe, expect, it } from 'vitest';
import { pickMove, temperatureFor, MIN_TEMPERATURE, MAX_TEMPERATURE } from './sampling';
import type { BookNode, OpeningTree } from './types';

/**
 * Guardrails on the SHIPPED opening books (not synthetic fixtures).
 *
 * A `trap` node is a victim-side error, seeded only so the bot can punish a
 * human who plays it. The trainer must therefore NEVER surface a trap as a
 * move to make — not as a hint (the green "top book move" arrow) and not as a
 * bot reply. Both of those go through `pickMove`, so the invariant is:
 *
 *     pickMove(children, t) must never return a trap node, for any t.
 *
 * Before the fix this failed twice on the top-move path alone: the Fried Liver
 * hinted 5...Nxd5 and the Vienna hinted 3...exf4 — both traps — because the
 * trap was the single most popular reply and `pickMove` picks argmax at t=0.
 */

/** Every shipped opening tree (the real JSON in static/), minus the index. */
function loadTrees(): OpeningTree[] {
	const modules = import.meta.glob<OpeningTree>('../../../static/openings/*.json', {
		eager: true,
		import: 'default'
	});
	return Object.entries(modules)
		.filter(([path]) => !path.endsWith('/index.json'))
		.map(([, tree]) => tree);
}

/** Every position in a tree: a sibling set of book moves plus the line leading to it. */
function* positions(tree: OpeningTree): Generator<{ line: string[]; children: BookNode[] }> {
	function* rec(children: BookNode[], line: string[]): Generator<{ line: string[]; children: BookNode[] }> {
		if (children.length > 0) yield { line, children };
		for (const c of children) yield* rec(c.children, [...line, c.san]);
	}
	yield* rec(tree.root.children, []);
}

/** Walk a tree by UCI, returning the reached node's children (or null off-book). */
function childrenAfter(tree: OpeningTree, uciMoves: string[]): BookNode[] | null {
	let children = tree.root.children;
	for (const uci of uciMoves) {
		const next = children.find((c) => c.uci === uci);
		if (!next) return null;
		children = next.children;
	}
	return children;
}

/** Deterministic LCG so sampling sweeps are reproducible. */
function seededRng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

const trees = loadTrees();

describe('opening book safety', () => {
	it('loads the shipped trees and they contain trap nodes (guards the suite itself)', () => {
		expect(trees.length).toBeGreaterThan(0);
		const trapCount = trees
			.flatMap((t) => [...positions(t)])
			.flatMap((p) => p.children)
			.filter((c) => c.trap).length;
		// If this ever hits 0 the invariant tests below would pass vacuously.
		expect(trapCount).toBeGreaterThan(0);
	});

	it('never hints a trap as the top book move (pickMove at t=0)', () => {
		const violations: string[] = [];
		for (const tree of trees) {
			for (const { line, children } of positions(tree)) {
				const top = pickMove(children, 0);
				if (top?.trap) {
					violations.push(`${tree.id}: after [${line.join(' ') || 'start'}] hint = ${top.san} (TRAP)`);
				}
			}
		}
		expect(violations).toEqual([]);
	});

	it('never samples a trap at any temperature (bot must not walk into its own trap)', () => {
		const temps = [temperatureFor(0.001), MIN_TEMPERATURE, 0.5, 1, MAX_TEMPERATURE];
		const violations: string[] = [];
		for (const tree of trees) {
			for (const { line, children } of positions(tree)) {
				if (!children.some((c) => c.trap)) continue;
				let hit: BookNode | null = null;
				for (const t of temps) {
					for (let seed = 0; seed < 500 && !hit; seed++) {
						const pick = pickMove(children, t, seededRng(seed));
						if (pick?.trap) hit = pick;
					}
					if (hit) break;
				}
				if (hit) {
					violations.push(`${tree.id}: after [${line.join(' ') || 'start'}] sampled ${hit.san} (TRAP)`);
				}
			}
		}
		expect(violations).toEqual([]);
	});

	it('recommends the real refutation in the Fried Liver, not the 5...Nxd5 trap (reported bug)', () => {
		const fried = trees.find((t) => t.id === 'fried-liver');
		expect(fried).toBeDefined();
		// 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Ng5 d5 5.exd5 — Black (the refuter) to move.
		const children = childrenAfter(fried!, [
			'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'd7d5', 'e4d5'
		]);
		expect(children).not.toBeNull();
		const top = pickMove(children!, 0);
		expect(top).not.toBeNull();
		expect(top!.trap).toBeFalsy();
		expect(top!.san).toBe('Na5');
	});
});
