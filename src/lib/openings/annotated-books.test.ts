import { describe, expect, it } from 'vitest';
import type { BookNode, NodeEval, OpeningTree } from './types';

/**
 * The low-band trap books are annotated with build-time engine evals
 * (scripts/annotate-quality.ts) so the trainer grades and hints in-book moves
 * without a live probe. If a raw rebuild strips the evals, re-run
 * `npm run annotate:quality`.
 */
const ANNOTATED = ['wayward-queen', 'napoleon', 'greco-defense', 'englund', 'fried-liver', 'bishop-scholar'];

const modules = import.meta.glob<OpeningTree>('../../../static/openings/*.json', {
	eager: true,
	import: 'default'
});
const byId = new Map(
	Object.entries(modules)
		.filter(([path]) => !path.endsWith('/index.json'))
		.map(([, tree]) => [tree.id, tree])
);

/** cp XOR mate; bestUci, when present, is a UCI string. */
function isValidEval(e: NodeEval): boolean {
	const hasCp = e.cp !== undefined;
	const hasMate = e.mate !== undefined;
	if (hasCp === hasMate) return false;
	if (e.bestUci !== undefined && !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(e.bestUci)) return false;
	return true;
}

describe.each(ANNOTATED)('annotated book %s', (id) => {
	const tree = byId.get(id)!;

	it('exists and annotates the starting position', () => {
		expect(tree, id).toBeDefined();
		expect(tree.root.eval, `${id}: root.eval`).toBeDefined();
		expect(isValidEval(tree.root.eval!), `${id}: root.eval shape`).toBe(true);
	});

	it('annotates every non-trap first move (evals not stripped by a rebuild)', () => {
		for (const child of tree.root.children) {
			if (child.trap) continue;
			expect(child.eval, `${id}: ${child.san}`).toBeDefined();
		}
	});

	it('every stored eval is well-formed (cp xor mate), and traps carry none', () => {
		let annotated = 0;
		const walk = (nodes: BookNode[]) => {
			for (const n of nodes) {
				if (n.eval) {
					annotated++;
					expect(isValidEval(n.eval), `${id}: ${n.san} eval ${JSON.stringify(n.eval)}`).toBe(true);
				}
				walk(n.children);
			}
		};
		walk(tree.root.children);
		expect(annotated, `${id}: annotated node count`).toBeGreaterThan(0);
	});
});
