import { describe, expect, it } from 'vitest';
import { bookShare, bookVerdict } from './book-verdict';
import type { BookNode } from '$lib/openings/types';

function node(partial: Partial<BookNode> & { uci: string }): BookNode {
	return { san: partial.uci, weight: 1, children: [], ...partial };
}

describe('bookShare', () => {
	it('computes the share over non-trap siblings only', () => {
		const child = node({ uci: 'a', weight: 30 });
		const siblings = [child, node({ uci: 'b', weight: 70 }), node({ uci: 't', weight: 900, trap: true })];
		expect(bookShare(child, siblings)).toBe(30);
	});

	it('returns 0 when there is no weight at all', () => {
		const child = node({ uci: 'a', weight: 0 });
		expect(bookShare(child, [child])).toBe(0);
	});
});

describe('bookVerdict', () => {
	it('returns null for a merely-popular explorer move (no endorsement)', () => {
		const child = node({ uci: 'd6', weight: 500 });
		const siblings = [child, node({ uci: 'd5', weight: 300 })];
		expect(bookVerdict(child, siblings)).toBeNull();
	});

	it('returns null for traps (callers short-circuit them anyway)', () => {
		const child = node({ uci: 'g6', weight: 900, trap: true, forced: true });
		expect(bookVerdict(child, [child])).toBeNull();
	});

	it('gives a forced seed move the book badge with the popularity detail', () => {
		const child = node({ uci: 'e5', weight: 25, forced: true });
		const siblings = [child, node({ uci: 'c5', weight: 75 })];
		expect(bookVerdict(child, siblings)).toEqual({
			badge: 'book',
			detail: 'Book move — played in 25% of games here'
		});
	});

	it('gives book-best to the most popular endorsed move when nothing is recommended', () => {
		const child = node({ uci: 'e5', weight: 75, forced: true });
		const siblings = [child, node({ uci: 'c5', weight: 25 })];
		expect(bookVerdict(child, siblings)?.badge).toBe('book-best');
	});

	it('gives book-best to a recommended move even when a trap is more popular', () => {
		const child = node({ uci: 'nf6', weight: 40, forced: true, recommended: true });
		const siblings = [
			child,
			node({ uci: 'g6', weight: 999, trap: true }),
			node({ uci: 'qf6', weight: 20, forced: true })
		];
		expect(bookVerdict(child, siblings)?.badge).toBe('book-best');
	});

	it('demotes the popularity winner to plain book when a sibling is recommended', () => {
		const child = node({ uci: 'qf6', weight: 60, forced: true });
		const siblings = [child, node({ uci: 'nf6', san: 'Nf6', weight: 40, forced: true, recommended: true })];
		expect(bookVerdict(child, siblings)).toEqual({
			badge: 'book',
			detail: 'Book move, but the prepared line is Nf6 here.'
		});
	});

	it('a recommended move that is not the popularity top stays plain book', () => {
		const child = node({ uci: 'nf6', weight: 40, forced: true, recommended: true });
		const siblings = [child, node({ uci: 'd6', weight: 60 })];
		expect(bookVerdict(child, siblings)?.badge).toBe('book');
	});

	it('an authored comment endorses the move and beats the popularity detail', () => {
		const child = node({ uci: 'c6', weight: 10, comment: 'The point: undermine the centre.' });
		const siblings = [child, node({ uci: 'd5', weight: 90 })];
		expect(bookVerdict(child, siblings)).toEqual({
			badge: 'book',
			detail: 'The point: undermine the centre.'
		});
	});

	it('says plain "Book move" when weights carry no signal', () => {
		const child = node({ uci: 'e5', weight: 0, forced: true });
		expect(bookVerdict(child, [child])?.detail).toBe('Book move');
	});
});
