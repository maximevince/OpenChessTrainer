/**
 * Attach hand-named lines (`spec.namedLines`) to a built opening tree as
 * `tree.variations`, ensuring each line's moves exist as forced/trap skeleton
 * nodes. Shared by the full builder (`build-openings.ts`) and the no-network
 * post-processor (`build-variations.ts`).
 */
import { Chess } from 'chess.js';
import type { OpeningSpec } from './openings.config';
import type { BookNode, OpeningSide, OpeningTree, OpeningVariation } from '../src/lib/openings/types';

const sideAtPly = (ply: number): OpeningSide => (ply % 2 === 0 ? 'white' : 'black');

/**
 * Walk `line` (SAN from move 1) through the tree, creating any missing nodes as
 * forced (and trap when it's a punishment: the first fresh move by the
 * non-opening side is the flagged error, matching build-openings' seedSkeleton).
 * Returns the canonical UCI path. Throws on illegal SAN — a config bug to surface.
 */
function ensureLine(
	root: { children: BookNode[] },
	line: string[],
	isTrap: boolean,
	openingSide: OpeningSide
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
			if (isTrap && !errFlagged && sideAtPly(ply) !== openingSide) {
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
	if (!spec.namedLines?.length) return;
	tree.variations = spec.namedLines.map((nl) => {
		const uci = ensureLine(tree.root, nl.moves, nl.trap === true, spec.side);
		const v: OpeningVariation = { name: nl.name, uci };
		if (nl.trap) v.trap = true;
		return v;
	});
}
