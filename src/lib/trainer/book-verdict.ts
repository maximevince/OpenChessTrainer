import type { BookNode } from '$lib/openings/types';

/**
 * Endorsement-gated book badges. A move being popular in the explorer data is
 * NOT an endorsement — trap books draw from 400-1200 pools where the most
 * played move is often losing. Only curated content (seeded `forced` lines,
 * `recommended` picks, authored comments) earns a book badge; anything else
 * gets no badge and is engine-graded like an out-of-book move.
 */
export interface BookVerdict {
	badge: 'book-best' | 'book';
	detail: string;
}

/** The child's share of non-trap sibling weight, as a rounded percentage. */
export function bookShare(child: BookNode, siblings: BookNode[]): number {
	const real = siblings.filter((c) => !c.trap);
	const total = real.reduce((s, c) => s + c.weight, 0);
	return total > 0 ? Math.round((100 * child.weight) / total) : 0;
}

/**
 * Badge decision for a user move that matched a book child. `siblings` is the
 * full child list including `child`; trap children are excluded from the
 * popularity math so the endorsed refutation can be "book-best" even when a
 * punished move is more popular. Returns null for a merely-popular move (no
 * endorsement) — and for traps, though callers handle those first.
 */
export function bookVerdict(child: BookNode, siblings: BookNode[]): BookVerdict | null {
	if (child.trap) return null;
	if (!child.forced && !child.recommended && !child.comment) return null;
	const real = siblings.filter((c) => !c.trap);
	const isTop = child.weight >= Math.max(...real.map((c) => c.weight));
	const recommended = real.find((c) => c.recommended);
	const share = bookShare(child, siblings);
	let detail = share > 0 ? `Book move — played in ${share}% of games here` : 'Book move';
	if (child.comment) {
		detail = child.comment;
	} else if (recommended && !child.recommended) {
		// Nudge toward the prepared pick — works for either side (repertoire
		// mainlines and endorsed refutations alike).
		detail = `Book move, but the prepared line is ${recommended.san} here.`;
	}
	const badge = isTop && (child.recommended || !recommended) ? 'book-best' : 'book';
	return { badge, detail };
}
