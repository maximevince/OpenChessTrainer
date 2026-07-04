export type Site = 'chess.com' | 'lichess';

export interface ReviewGame {
	site: Site;
	id: string;
	white: { name: string; rating?: number };
	black: { name: string; rating?: number };
	result: '1-0' | '0-1' | '½-½' | '*';
	/** Game end, epoch ms. */
	endTime: number;
	/** bullet / blitz / rapid / classical / daily … */
	speed: string;
	/** Opening name when the site provides one. */
	opening?: string;
	pgn: string;
}

const MAX_GAMES = 30;

export async function fetchGames(site: Site, username: string): Promise<ReviewGame[]> {
	const user = username.trim();
	if (!user) throw new Error('Enter a username.');
	return site === 'chess.com' ? fetchChessCom(user) : fetchLichess(user);
}

async function fetchChessCom(user: string): Promise<ReviewGame[]> {
	const archRes = await fetch(
		`https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`
	);
	if (archRes.status === 404) throw new Error(`No Chess.com user named “${user}”.`);
	if (!archRes.ok) throw new Error(`Chess.com returned ${archRes.status}. Try again later.`);
	const { archives } = (await archRes.json()) as { archives: string[] };
	if (!archives?.length) return [];

	// Newest month(s) first; two months is plenty for MAX_GAMES.
	const games: ReviewGame[] = [];
	for (const url of archives.slice(-2).reverse()) {
		const res = await fetch(url);
		if (!res.ok) continue;
		const month = (await res.json()) as { games: ChessComGame[] };
		for (const g of month.games.slice().reverse()) {
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
			if (games.length >= MAX_GAMES) return games;
		}
	}
	return games;
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

async function fetchLichess(user: string): Promise<ReviewGame[]> {
	const res = await fetch(
		`https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${MAX_GAMES}&pgnInJson=true&opening=true`,
		{ headers: { Accept: 'application/x-ndjson' } }
	);
	if (res.status === 404) throw new Error(`No Lichess user named “${user}”.`);
	if (!res.ok) throw new Error(`Lichess returned ${res.status}. Try again later.`);
	const text = await res.text();
	const games: ReviewGame[] = [];
	for (const line of text.split('\n')) {
		if (!line.trim()) continue;
		const g = JSON.parse(line) as LichessGame;
		if (g.variant !== 'standard' || !g.pgn) continue;
		games.push({
			site: 'lichess',
			id: g.id,
			white: { name: playerName(g.players.white), rating: g.players.white.rating },
			black: { name: playerName(g.players.black), rating: g.players.black.rating },
			result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½',
			endTime: g.lastMoveAt ?? g.createdAt,
			speed: g.speed,
			opening: g.opening?.name,
			pgn: g.pgn
		});
	}
	return games;
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
	winner?: 'white' | 'black';
	players: { white: LichessPlayer; black: LichessPlayer };
	opening?: { eco: string; name: string };
	pgn?: string;
}

function playerName(p: LichessPlayer): string {
	return p.user?.name ?? (p.aiLevel !== undefined ? `Stockfish lvl ${p.aiLevel}` : 'Anonymous');
}
