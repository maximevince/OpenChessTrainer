/**
 * Attach named lines to a built opening tree as `tree.variations`: one per
 * repertoire chapter (`spec.repertoirePgn`), then the hand-named lines
 * (`spec.namedLines`), ensuring each named line's moves exist as forced/trap
 * skeleton nodes. Replaces `tree.variations` wholesale so re-runs are
 * idempotent. Shared by the full builder (`build-openings.ts`) and the
 * no-network post-processor (`build-variations.ts`).
 */
import { Chess } from 'chess.js';
import type { OpeningSpec } from './openings.config';
import { chapterVariations, loadRepertoireChapters } from './repertoire-build';
import type { BookNode, OpeningSide, OpeningTree, OpeningVariation } from '../src/lib/openings/types';

const sideAtPly = (ply: number): OpeningSide => (ply % 2 === 0 ? 'white' : 'black');

/**
 * Walk `line` (SAN from move 1) through the tree, creating any missing nodes as
 * forced (and trap when it's a punishment: the first fresh move by `errSide` —
 * the erring side — is the flagged error, matching build-openings' seedSkeleton).
 * Returns the canonical UCI path. Throws on illegal SAN — a config bug to surface.
 */
function ensureLine(
	root: { children: BookNode[] },
	line: string[],
	isTrap: boolean,
	errSide: OpeningSide
): string[] {
	const chess = new Chess();
	let siblings = root.children;
	const uciPath: string[] = [];
	let errFlagged = false;
	line.forEach((san, ply) => {
		const move = chess.move(san); // throws on illegal
		const uci = move.from + move.to + (move.promotion ?? '');
		uciPath.push(uci);
		let node = siblings.find((n) => n.uci === uci);
		if (!node) {
			node = { uci, san: move.san, weight: 1, forced: true, children: [] };
			if (isTrap && !errFlagged && sideAtPly(ply) === errSide) {
				node.trap = true;
				errFlagged = true;
			}
			siblings.push(node);
		} else {
			node.forced = true;
		}
		siblings = node.children;
	});
	return uciPath;
}

export function attachVariations(tree: OpeningTree, spec: OpeningSpec): void {
	const chapters = loadRepertoireChapters(spec);
	const fromChapters = chapters ? chapterVariations(chapters) : [];
	const otherSide: OpeningSide = spec.side === 'white' ? 'black' : 'white';
	const fromNamed = (spec.namedLines ?? []).map((nl) => {
		const uci = ensureLine(tree.root, nl.moves, nl.trap === true, nl.errBy ?? otherSide);
		const v: OpeningVariation = { name: nl.name, uci };
		if (nl.trap) v.trap = true;
		return v;
	});
	const variations = [...fromChapters, ...fromNamed];
	if (variations.length > 0) tree.variations = variations;
}
