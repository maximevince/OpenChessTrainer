import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGames, PAGE_SIZE, type Cursor } from './fetch';

const PGN = '[Event "x"]\n\n1. e4 e5 *';

function chessComGame(n: number) {
	return {
		url: `https://www.chess.com/game/${n}`,
		pgn: PGN,
		end_time: n,
		time_class: 'rapid',
		rules: 'chess',
		white: { username: 'a', rating: 1500, result: 'win' },
		black: { username: 'b', rating: 1500, result: 'checkmated' }
	};
}

function lichessGame(createdAt: number, variant = 'standard') {
	return {
		id: `g${createdAt}`,
		variant,
		speed: 'rapid',
		perf: 'rapid',
		createdAt,
		lastMoveAt: createdAt + 1,
		status: 'mate',
		winner: 'white',
		players: { white: { user: { name: 'a' } }, black: { user: { name: 'b' } } },
		pgn: PGN
	};
}

async function walk(site: 'chess.com' | 'lichess') {
	const pages = [];
	let cursor: Cursor | undefined;
	for (;;) {
		const page = await fetchGames(site, 'user', cursor);
		pages.push(page.games);
		if (!page.next) break;
		cursor = page.next;
	}
	return pages;
}

describe('fetchGames', () => {
	const calls: string[] = [];
	let respond: (url: string) => unknown;

	beforeEach(() => {
		calls.length = 0;
		vi.stubGlobal('fetch', async (url: string) => {
			calls.push(url);
			const body = respond(url);
			return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
				status: 200
			});
		});
	});
	afterEach(() => vi.unstubAllGlobals());

	describe('chess.com', () => {
		// Three monthly archives, oldest first: 4, 20 and 10 games (the API's per-month order).
		const months: Record<string, number> = { '2026/01': 4, '2026/02': 20, '2026/03': 10 };
		beforeEach(() => {
			respond = (url) => {
				if (url.endsWith('/archives')) {
					return { archives: Object.keys(months).map((m) => `https://x/${m}`) };
				}
				const m = url.slice(-7);
				const base = { '2026/01': 100, '2026/02': 200, '2026/03': 300 }[m]!;
				return {
					games: Array.from({ length: months[m] }, (_, i) => chessComGame(base + i))
				};
			};
		});

		it('pages newest-first across months without gaps or duplicates', async () => {
			const pages = await walk('chess.com');
			expect(pages.map((p) => p.length)).toEqual([15, 15, 4]);
			const ids = pages.flat().map((g) => g.endTime / 1000);
			expect(ids).toEqual([...ids].sort((a, b) => b - a));
			expect(new Set(ids).size).toBe(34);
		});

		it('reuses the archive list from the cursor instead of refetching it', async () => {
			const first = await fetchGames('chess.com', 'user');
			calls.length = 0;
			await fetchGames('chess.com', 'user', first.next!);
			expect(calls.some((u) => u.endsWith('/archives'))).toBe(false);
		});

		it('skips non-standard games', async () => {
			respond = (url) =>
				url.endsWith('/archives')
					? { archives: ['https://x/2026/01'] }
					: { games: [chessComGame(1), { ...chessComGame(2), rules: 'chess960' }] };
			const page = await fetchGames('chess.com', 'user');
			expect(page.games).toHaveLength(1);
			expect(page.next).toBeNull();
		});
	});

	describe('lichess', () => {
		it('passes max and until, and stops on a short page', async () => {
			respond = (url) => {
				const until = Number(new URL(url).searchParams.get('until') ?? 1e6);
				const n = until > 1000 ? PAGE_SIZE : 3;
				return Array.from({ length: n }, (_, i) => lichessGame(Math.min(until, 1000) - i))
					.map((g) => JSON.stringify(g))
					.join('\n');
			};
			const pages = await walk('lichess');
			expect(pages.map((p) => p.length)).toEqual([PAGE_SIZE, 3]);
			expect(new URL(calls[0]).searchParams.get('max')).toBe(String(PAGE_SIZE));
			// Filters like perfType switch Lichess to its search-index path, which ignores max.
			expect(new URL(calls[0]).searchParams.has('perfType')).toBe(false);
			// Second page starts just before the oldest game of the first.
			expect(new URL(calls[1]).searchParams.get('until')).toBe(String(1000 - PAGE_SIZE));
		});

		it('caps an over-long response and points the cursor at the last kept game', async () => {
			respond = () =>
				Array.from({ length: 24 }, (_, i) => lichessGame(1000 - i))
					.map((g) => JSON.stringify(g))
					.join('\n');
			const page = await fetchGames('lichess', 'user');
			expect(page.games).toHaveLength(PAGE_SIZE);
			expect(page.next).toEqual({ site: 'lichess', until: 1000 - (PAGE_SIZE - 1) - 1 });
		});

		it('filters variants but keeps paging from the oldest received game', async () => {
			respond = () =>
				Array.from({ length: PAGE_SIZE }, (_, i) => lichessGame(1000 - i, 'atomic'))
					.map((g) => JSON.stringify(g))
					.join('\n');
			const page = await fetchGames('lichess', 'user');
			expect(page.games).toHaveLength(0);
			expect(page.next).toEqual({ site: 'lichess', until: 1000 - PAGE_SIZE });
		});
	});
});
