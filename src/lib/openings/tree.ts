import { base } from '$app/paths';
import type { BookNode, OpeningIndex, OpeningTree } from './types';

const treeCache = new Map<string, Promise<OpeningTree>>();
let indexCache: Promise<OpeningIndex> | null = null;

export function loadIndex(): Promise<OpeningIndex> {
	indexCache ??= fetch(`${base}/openings/index.json`).then((r) => {
		if (!r.ok) throw new Error(`Failed to load openings index: ${r.status}`);
		return r.json();
	});
	return indexCache;
}

export function loadOpening(id: string): Promise<OpeningTree> {
	let cached = treeCache.get(id);
	if (!cached) {
		cached = fetch(`${base}/openings/${id}.json`).then((r) => {
			if (!r.ok) throw new Error(`Failed to load opening "${id}": ${r.status}`);
			return r.json();
		});
		treeCache.set(id, cached);
	}
	return cached;
}

/**
 * Walk the tree along a UCI move sequence.
 * Returns the node reached (whose children are the book continuations),
 * or null once the game has left the book.
 */
export function follow(
	root: { children: BookNode[] },
	uciMoves: string[]
): { children: BookNode[] } | null {
	let node: { children: BookNode[] } = root;
	for (const uci of uciMoves) {
		const child = node.children.find((c) => c.uci === uci);
		if (!child) return null;
		node = child;
	}
	return node;
}
