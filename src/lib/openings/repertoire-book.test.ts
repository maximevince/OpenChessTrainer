import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mainline, parseRepertoirePgn } from './repertoire';
import type { BookNode, OpeningTree } from './types';

/**
 * Guardrails on curated repertoires, in two layers:
 *
 * 1. The authored PGN itself (`scripts/repertoires/*.pgn`) — always checked,
 *    so a bad edit fails CI before anyone rebuilds the books.
 * 2. The SHIPPED tree built from it — checked once the book has been rebuilt
 *    (`tree.source` mentions "curated repertoire"); skipped before that so
 *    the suite stays green between authoring and rebuilding.
 */

const ROOT = join(__dirname, '..', '..', '..');

const caroPgn = readFileSync(join(ROOT, 'scripts', 'repertoires', 'caro-kann.pgn'), 'utf8');
const chapters = parseRepertoirePgn(caroPgn);

describe('caro-kann repertoire PGN', () => {
	it('has the six systems as chapters', () => {
		expect(chapters.map((c) => c.name)).toEqual([
			'Advance system',
			'Exchange',
			'Classical',
			'Fantasy',
			'Panov Attack',
			'Two Knights and sidelines'
		]);
	});

	it('covers the Fantasy (3.f3) with a Black answer', () => {
		const fantasy = chapters.find((c) => c.name === 'Fantasy')!;
		expect(mainline(fantasy).san.slice(0, 6)).toEqual(['e4', 'c6', 'd4', 'd5', 'f3', 'e6']);
	});

	it('keeps every mainline deep enough to be worth drilling', () => {
		for (const ch of chapters) {
			expect(mainline(ch).uci.length, ch.name).toBeGreaterThanOrEqual(16);
		}
	});

	it('ends every mainline with a Black move (the trainee is never stranded)', () => {
		for (const ch of chapters) {
			expect(mainline(ch).uci.length % 2, ch.name).toBe(0);
		}
	});

	it('uses printable ASCII only (byte-naive PGN consumers)', () => {
		expect(caroPgn.match(/[^\x20-\x7e\n]/g)).toBeNull();
	});

	it('gives every chapter an intro comment', () => {
		for (const ch of chapters) {
			expect(ch.intro, ch.name).toBeTruthy();
		}
	});
});

/** Shipped trees built from a curated repertoire (empty until rebuilt). */
function loadRepertoireTrees(): OpeningTree[] {
	const modules = import.meta.glob<OpeningTree>('../../../static/openings/*.json', {
		eager: true,
		import: 'default'
	});
	return Object.entries(modules)
		.filter(([path]) => !path.endsWith('/index.json'))
		.map(([, tree]) => tree)
		.filter((t) => t.source.includes('curated repertoire'));
}

function childrenAfter(tree: OpeningTree, uciMoves: string[]): BookNode[] | null {
	let children = tree.root.children;
	for (const uci of uciMoves) {
		const next = children.find((c) => c.uci === uci);
		if (!next) return null;
		children = next.children;
	}
	return children;
}

function* siblingGroups(children: BookNode[]): Generator<BookNode[]> {
	if (children.length > 0) yield children;
	for (const c of children) yield* siblingGroups(c.children);
}

const repTrees = loadRepertoireTrees();

describe.skipIf(repTrees.length === 0)('shipped repertoire-built trees', () => {
	it('resolves every named variation path in the tree', () => {
		for (const tree of repTrees) {
			for (const v of tree.variations ?? []) {
				expect(childrenAfter(tree, v.uci), `${tree.id}: ${v.name}`).not.toBeNull();
			}
		}
	});

	it('marks at most one recommended move per position, and it is the weight argmax', () => {
		for (const tree of repTrees) {
			for (const group of siblingGroups(tree.root.children)) {
				const rec = group.filter((n) => n.recommended);
				expect(rec.length, tree.id).toBeLessThanOrEqual(1);
				if (rec.length === 1) {
					const maxWeight = Math.max(...group.filter((n) => !n.trap).map((n) => n.weight));
					expect(rec[0].weight, `${tree.id}: ${rec[0].san}`).toBe(maxWeight);
				}
			}
		}
	});

	it('carries authored comments into the tree', () => {
		for (const tree of repTrees) {
			let count = 0;
			for (const group of siblingGroups(tree.root.children)) {
				count += group.filter((n) => n.comment).length;
			}
			expect(count, tree.id).toBeGreaterThan(10);
		}
	});
});

describe.skipIf(repTrees.every((t) => t.id !== 'caro-kann'))('rebuilt caro-kann book', () => {
	const caro = repTrees.find((t) => t.id === 'caro-kann')!;

	it('meets the Fantasy at the board (3.f3 has a recommended reply)', () => {
		const afterF3 = childrenAfter(caro, ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'f2f3']);
		expect(afterF3).not.toBeNull();
		expect(afterF3!.some((c) => c.san === 'e6' && c.recommended)).toBe(true);
	});

	it('offers all main White third moves after 1.e4 c6 2.d4 d5', () => {
		const third = childrenAfter(caro, ['e2e4', 'c7c6', 'd2d4', 'd7d5'])!;
		const sans = third.map((c) => c.san);
		for (const san of ['e5', 'exd5', 'Nc3', 'f3']) expect(sans, san).toContain(san);
	});
});
