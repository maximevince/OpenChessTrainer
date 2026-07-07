/**
 * Build-time helpers for curated repertoire PGNs (`spec.repertoirePgn`):
 * load + parse the file, graft its chapters onto a tree skeleton, and derive
 * the picker variations from chapter mainlines. Shared by the full builder
 * (`build-openings.ts`) and the no-network refresher (`build-variations.ts`).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
	mainline,
	parseRepertoirePgn,
	type RepertoireChapter,
	type RepertoireNode
} from '../src/lib/openings/repertoire';
import type { OpeningSpec } from './openings.config';
import type { BookNode, OpeningSide, OpeningVariation } from '../src/lib/openings/types';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

/** Parse the spec's repertoire PGN, or null when the spec has none. */
export function loadRepertoireChapters(spec: OpeningSpec): RepertoireChapter[] | null {
	if (!spec.repertoirePgn) return null;
	return parseRepertoirePgn(readFileSync(join(ROOT, spec.repertoirePgn), 'utf8'));
}

/**
 * Graft the chapters onto `rootChildren` as forced skeleton nodes, carrying
 * comments and marking the opening side's PGN mainline moves `recommended`
 * (first sibling in source order; an already-recommended sibling from an
 * earlier chapter wins).
 */
export function graftRepertoire<T extends BookNode>(
	chapters: RepertoireChapter[],
	rootChildren: T[],
	side: OpeningSide,
	create: (rn: RepertoireNode) => T
): void {
	const openingSideAt = (depth: number) => (depth % 2 === 0 ? 'white' : 'black') === side;
	const visit = (src: RepertoireNode[], dest: T[], depth: number): void => {
		src.forEach((rn, i) => {
			let node = dest.find((n) => n.uci === rn.uci);
			if (!node) {
				node = create(rn);
				dest.push(node);
			}
			node.forced = true;
			if (openingSideAt(depth) && i === 0 && !dest.some((n) => n.recommended)) {
				node.recommended = true;
			}
			if (rn.comment && !node.comment) node.comment = rn.comment;
			visit(rn.children, node.children as T[], depth + 1);
		});
	};
	for (const chapter of chapters) visit(chapter.moves, rootChildren, 0);
}

/** One named variation per chapter: its mainline, with the intro if present. */
export function chapterVariations(chapters: RepertoireChapter[]): OpeningVariation[] {
	return chapters.map((ch) => {
		const v: OpeningVariation = { name: ch.name, uci: mainline(ch).uci };
		if (ch.intro) v.intro = ch.intro;
		return v;
	});
}
