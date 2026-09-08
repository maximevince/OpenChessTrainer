export type Site = 'chess.com' | 'lichess';

/** What the review viewer needs to show a game — fetched, imported or handed off from training. */
export interface ViewerGame {
	white: { name: string; rating?: number };
	black: { name: string; rating?: number };
	result: '1-0' | '0-1' | '½-½' | '*';
	/** bullet / blitz / rapid / classical / daily / training / import … */
	speed: string;
	/** Opening name when known. */
	opening?: string;
	pgn: string;
}

/** A game fetched from an online site (adds identity + timing to {@link ViewerGame}). */
export interface ReviewGame extends ViewerGame {
	site: Site;
	id: string;
	/** Game end, epoch ms. */
	endTime: number;
}

export const PAGE_SIZE = 15;

/** Opaque position in a user's game history; feed back to {@link fetchGames} for the next page. */
export type Cursor =
	| { site: 'chess.com'; archives: string[]; index: number; skip: number }
	| { site: 'lichess'; until: number };

export interface GamePage {
	games: ReviewGame[];
	/** Cursor for the next (older) page, or null when the history is exhausted. */
	next: Cursor | null;
}

export async function fetchGames(site: Site, username: string, cursor?: Cursor): Promise<GamePage> {
	const user = username.trim();
	if (!user) throw new Error('Enter a username.');
	if (cursor && cursor.site !== site) cursor = undefined;
	return cursor?.site === 'chess.com' || (!cursor && site === 'chess.com')
		? fetchChessCom(user, cursor?.site === 'chess.com' ? cursor : undefined)
		: fetchLichess(user, cursor?.site === 'lichess' ? cursor : undefined);
}

type ChessComCursor = Extract<Cursor, { site: 'chess.com' }>;
type LichessCursor = Extract<Cursor, { site: 'lichess' }>;

async function fetchChessCom(user: string, cursor?: ChessComCursor): Promise<GamePage> {
	let archives = cursor?.archives;
	if (!archives) {
		const archRes = await fetch(
			`https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`
		);
		if (archRes.status === 404) throw new Error(`No Chess.com user named “${user}”.`);
		if (!archRes.ok) throw new Error(`Chess.com returned ${archRes.status}. Try again later.`);
		archives = ((await archRes.json()) as { archives: string[] }).archives ?? [];
	}

	// Archives are monthly, oldest first: walk backwards from `index`, skipping the
	// `skip` newest games of that month already handed out on the previous page.
	const games: ReviewGame[] = [];
	let index = cursor?.index ?? archives.length - 1;
	let skip = cursor?.skip ?? 0;
	for (; index >= 0; index--, skip = 0) {
		const res = await fetch(archives[index]);
		if (!res.ok) continue;
		const month = ((await res.json()) as { games: ChessComGame[] }).games.slice().reverse();
		for (let i = skip; i < month.length; i++) {
			const g = month[i];
			if (g.rules !== 'chess' || !g.pgn) continue;
			games.push({
				site: 'chess.com',
				id: g.url ?? String(g.end_time),
				white: { name: g.white.username, rating: g.white.rating },
				black: { name: g.black.username, rating: g.black.rating },
				result: chessComResult(g),
				endTime: g.end_time * 1000,
				speed: g.time_class,
				opening: chessComOpening(g.pgn),
				pgn: g.pgn
			});
			if (games.length >= PAGE_SIZE) {
				const next: ChessComCursor =
					i + 1 < month.length
						? { site: 'chess.com', archives, index, skip: i + 1 }
						: { site: 'chess.com', archives, index: index - 1, skip: 0 };
				return { games, next: next.index >= 0 ? next : null };
			}
		}
	}
	return { games, next: null };
}

interface ChessComGame {
	url?: string;
	pgn?: string;
	end_time: number;
	time_class: string;
	rules: string;
	white: { username: string; rating: number; result: string };
	black: { username: string; rating: number; result: string };
}

/** Opening name from the PGN's ECOUrl slug (stops at the first move-number token), or the ECO code. */
function chessComOpening(pgn: string): string | undefined {
	const url = /\[ECOUrl "([^"]+)"\]/.exec(pgn)?.[1];
	if (url) {
		const words = [];
		for (const token of (url.split('/').pop() ?? '').split('-')) {
			if (/\d/.test(token)) break;
			words.push(token);
		}
		if (words.length > 0) return words.join(' ');
	}
	return /\[ECO "([^"]+)"\]/.exec(pgn)?.[1];
}

function chessComResult(g: ChessComGame): ReviewGame['result'] {
	if (g.white.result === 'win') return '1-0';
	if (g.black.result === 'win') return '0-1';
	const draws = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'];
	return draws.includes(g.white.result) ? '½-½' : '*';
}

async function fetchLichess(user: string, cursor?: LichessCursor): Promise<GamePage> {
	// No perfType/rated/color filters: those switch Lichess to its search-index path,
	// which ignores `max` and streams differently. Variants are filtered client-side.
	const params = new URLSearchParams({ max: String(PAGE_SIZE), pgnInJson: 'true', opening: 'true' });
	// Lichess orders by createdAt descending; `until` is inclusive on that timestamp.
	if (cursor) params.set('until', String(cursor.until));
	const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?${params}`, {
		headers: { Accept: 'application/x-ndjson' }
	});
	if (res.status === 404) throw new Error(`No Lichess user named “${user}”.`);
	if (res.status === 429) {
		throw new Error(
			'Lichess is refusing: it allows two game downloads at a time per network, and a stuck one can block for up to an hour. Try again later.'
		);
	}
	if (!res.ok) throw new Error(`Lichess returned ${res.status}. Try again later.`);
	const text = await res.text();
	// Page client-side rather than trusting `max`, so the cursor always points just
	// past the last game actually handed out.
	const all: { game: ReviewGame; createdAt: number }[] = [];
	let received = 0;
	let oldest = Infinity;
	for (const line of text.split('\n')) {
		if (!line.trim()) continue;
		const g = JSON.parse(line) as LichessGame;
		received++;
		oldest = Math.min(oldest, g.createdAt);
		if (g.variant !== 'standard' || !g.pgn) continue;
		all.push({
			createdAt: g.createdAt,
			game: {
				site: 'lichess',
				id: g.id,
				white: { name: playerName(g.players.white), rating: g.players.white.rating },
				black: { name: playerName(g.players.black), rating: g.players.black.rating },
				result: lichessResult(g),
				endTime: g.lastMoveAt ?? g.createdAt,
				speed: g.speed,
				opening: g.opening?.name,
				pgn: g.pgn
			}
		});
	}
	const page = all.slice(0, PAGE_SIZE);
	// A short response means the history ran out; otherwise continue from the oldest
	// game we kept (or the oldest received, when filtering left the page short).
	const until = all.length > PAGE_SIZE ? page[page.length - 1].createdAt : oldest;
	const next: LichessCursor | null =
		received >= PAGE_SIZE ? { site: 'lichess', until: until - 1 } : null;
	return { games: page.map((p) => p.game), next };
}

/** A winner is decisive; otherwise only genuinely finished games are draws (not aborted/ongoing). */
function lichessResult(g: LichessGame): ReviewGame['result'] {
	if (g.winner === 'white') return '1-0';
	if (g.winner === 'black') return '0-1';
	return g.status === 'draw' || g.status === 'stalemate' ? '½-½' : '*';
}

interface LichessPlayer {
	user?: { name: string };
	aiLevel?: number;
	rating?: number;
}

interface LichessGame {
	id: string;
	variant: string;
	speed: string;
	createdAt: number;
	lastMoveAt?: number;
	status?: string;
	winner?: 'white' | 'black';
	players: { white: LichessPlayer; black: LichessPlayer };
	opening?: { eco: string; name: string };
	pgn?: string;
}

function playerName(p: LichessPlayer): string {
	return p.user?.name ?? (p.aiLevel !== undefined ? `Stockfish lvl ${p.aiLevel}` : 'Anonymous');
}
