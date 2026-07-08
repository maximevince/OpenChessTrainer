import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPENINGS } from '../../../scripts/openings.config';
import { mainline, parseRepertoirePgn } from './repertoire';
import type { BookNode, OpeningTree } from './types';

/**
 * Guardrails on curated repertoires, in two layers:
 *
 * 1. The authored PGNs (`scripts/repertoires/*.pgn`) — always checked,
 *    so a bad edit fails CI before anyone rebuilds the books.
 * 2. The SHIPPED trees built from them — checked once a book has been rebuilt
 *    (`tree.source` mentions "curated repertoire"); skipped before that so
 *    the suite stays green between authoring and rebuilding.
 */

const ROOT = join(__dirname, '..', '..', '..');

const repertoires = OPENINGS.filter((s) => s.repertoirePgn).map((spec) => ({
	spec,
	chapters: parseRepertoirePgn(readFileSync(join(ROOT, spec.repertoirePgn!), 'utf8')),
	raw: readFileSync(join(ROOT, spec.repertoirePgn!), 'utf8')
}));

describe('repertoire PGNs', () => {
	it('exist for the mainline openings', () => {
		expect(repertoires.map((r) => r.spec.id)).toEqual([
			'london',
			'caro-kann',
			'italian',
			'ruy-lopez',
			'sicilian',
			'french',
			'queens-gambit',
			'vienna'
		]);
	});

	it('keeps every chapter mainline deep enough to be worth drilling', () => {
		for (const { spec, chapters } of repertoires) {
			for (const ch of chapters) {
				expect(mainline(ch).uci.length, `${spec.id}: ${ch.name}`).toBeGreaterThanOrEqual(15);
			}
		}
	});

	it('ends every mainline with the opening side to move next (trainee never stranded)', () => {
		for (const { spec, chapters } of repertoires) {
			// A line ending on the opening side's own move leaves the opponent
			// (bot) with explorer continuations; white lines are odd-length,
			// black lines even-length.
			const wanted = spec.side === 'white' ? 1 : 0;
			for (const ch of chapters) {
				expect(mainline(ch).uci.length % 2, `${spec.id}: ${ch.name}`).toBe(wanted);
			}
		}
	});

	it('uses printable ASCII only (byte-naive PGN consumers)', () => {
		for (const { spec, raw } of repertoires) {
			expect(raw.match(/[^\x20-\x7e\n]/g), spec.id).toBeNull();
		}
	});

	it('gives every chapter an intro comment and a unique name', () => {
		for (const { spec, chapters } of repertoires) {
			const names = new Set<string>();
			for (const ch of chapters) {
				expect(ch.intro, `${spec.id}: ${ch.name}`).toBeTruthy();
				expect(names.has(ch.name), `${spec.id}: duplicate "${ch.name}"`).toBe(false);
				names.add(ch.name);
			}
		}
	});
});

describe('caro-kann repertoire PGN', () => {
	const chapters = repertoires.find((r) => r.spec.id === 'caro-kann')!.chapters;

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
});

/** All shipped opening trees. */
function loadAllTrees(): OpeningTree[] {
	const modules = import.meta.glob<OpeningTree>('../../../static/openings/*.json', {
		eager: true,
		import: 'default'
	});
	return Object.entries(modules)
		.filter(([path]) => !path.endsWith('/index.json'))
		.map(([, tree]) => tree);
}

/** Shipped trees built from a curated repertoire (empty until rebuilt). */
function loadRepertoireTrees(): OpeningTree[] {
	return loadAllTrees().filter((t) => t.source.includes('curated repertoire'));
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

describe('shipped trees', () => {
	// The setup picker keys variations by name; a duplicate would make one
	// line unpickable.
	it('gives every variation a unique name within its book', () => {
		for (const tree of loadAllTrees()) {
			const names = (tree.variations ?? []).map((v) => v.name);
			expect(new Set(names).size, tree.id).toBe(names.length);
		}
	});

	it('resolves every named variation path in the tree', () => {
		for (const tree of loadAllTrees()) {
			for (const v of tree.variations ?? []) {
				expect(childrenAfter(tree, v.uci), `${tree.id}: ${v.name}`).not.toBeNull();
			}
		}
	});
});

describe.skipIf(repTrees.length === 0)('shipped repertoire-built trees', () => {
	it('labels every chapter variation kind: chapter', () => {
		for (const tree of repTrees) {
			// Chapters come first; hand namedLines (if any) follow.
			const chapterCount =
				(tree.variations?.length ?? 0) -
				(OPENINGS.find((s) => s.id === tree.id)?.namedLines?.length ?? 0);
			for (const v of (tree.variations ?? []).slice(0, chapterCount)) {
				expect(v.kind, `${tree.id}: ${v.name}`).toBe('chapter');
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
			expect(count, tree.id).toBeGreaterThanOrEqual(6);
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
