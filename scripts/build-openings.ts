/**
 * Builds the bundled opening books by querying the Lichess Opening Explorer.
 * Run with: npx tsx scripts/build-openings.ts [id ...]
 *
 * Etiquette: serial requests at ~1/s, 60s backoff on 429, descriptive
 * User-Agent, and a disk cache in scripts/.cache/ so re-runs are free.
 * Output goes to static/openings/ and is committed to the repo.
 */
import { Chess } from 'chess.js';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { OPENINGS, type OpeningSpec } from './openings.config';
import type { BookNode, OpeningIndexEntry, OpeningTree } from '../src/lib/openings/types';

const EXPLORER = 'https://explorer.lichess.org/lichess';
const USER_AGENT =
	'OpenChessTrainer-book-builder/1.0 (open-source chess trainer; contact: maxime@veemax.be)';
// The explorer requires authentication since 2026 (DDoS defense):
// create a personal token at https://lichess.org/account/oauth/token (no scopes needed).
const TOKEN = process.env.LICHESS_TOKEN;
// --seed-only: skip the explorer entirely and emit trees from the hand-seeded lines.
const SEED_ONLY = process.argv.includes('--seed-only');
const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const CACHE_DIR = join(ROOT, 'scripts', '.cache');
const OUT_DIR = join(ROOT, 'static', 'openings');

interface ExplorerMove {
	uci: string;
	san: string;
	white: number;
	draws: number;
	black: number;
}

interface ExplorerResponse {
	white: number;
	draws: number;
	black: number;
	moves: ExplorerMove[];
}

/** Build node: canonical UCI in `uci`, explorer's own UCI kept for the play chain. */
interface BuildNode extends BookNode {
	explorerUci: string;
	children: BuildNode[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastRequestAt = 0;
let requestCount = 0;

async function explorerQuery(
	playUcis: string[],
	spec: OpeningSpec
): Promise<{ response: ExplorerResponse; cached: boolean }> {
	const params = new URLSearchParams({
		variant: 'standard',
		play: playUcis.join(','),
		ratings: spec.ratings.join(','),
		speeds: spec.speeds.join(','),
		moves: '12',
		topGames: '0',
		recentGames: '0'
	});
	const url = `${EXPLORER}?${params}`;
	const cacheFile = join(CACHE_DIR, createHash('sha1').update(url).digest('hex') + '.json');
	if (existsSync(cacheFile)) {
		return { response: JSON.parse(readFileSync(cacheFile, 'utf8')), cached: true };
	}

	for (;;) {
		const wait = lastRequestAt + 1100 - Date.now();
		if (wait > 0) await sleep(wait);
		lastRequestAt = Date.now();
		requestCount++;
		const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
		if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
		const res = await fetch(url, { headers });
		if (res.status === 429) {
			console.warn('  429 from explorer — backing off 60s');
			await sleep(60_000);
			continue;
		}
		if (res.status === 401) {
			throw new Error(
				'Explorer returned 401 — it requires authentication. Set LICHESS_TOKEN ' +
					'(create one at https://lichess.org/account/oauth/token) or use --seed-only.'
			);
		}
		if (!res.ok) throw new Error(`Explorer ${res.status} for ${url}`);
		const json = (await res.json()) as ExplorerResponse;
		writeFileSync(cacheFile, JSON.stringify(json));
		return { response: json, cached: false };
	}
}

/** Whose move it is after `depth` plies from the start position. */
const sideToMove = (depth: number): 'white' | 'black' => (depth % 2 === 0 ? 'white' : 'black');

function isOpeningSideToMove(spec: OpeningSpec, depth: number): boolean {
	return sideToMove(depth) === spec.side;
}

/** Replay seed SAN lines through chess.js, creating forced skeleton nodes. */
function seedSkeleton(spec: OpeningSpec): BuildNode[] {
	const rootChildren: BuildNode[] = [];
	for (const line of spec.seedLines) {
		const chess = new Chess();
		let siblings = rootChildren;
		for (const san of line) {
			const move = chess.move(san); // throws on an illegal seed — config bug, fail loudly
			const uci = move.from + move.to + (move.promotion ?? '');
			let node = siblings.find((n) => n.uci === uci);
			if (!node) {
				node = { uci, explorerUci: uci, san: move.san, weight: 0, forced: true, children: [] };
				siblings.push(node);
			} else {
				node.forced = true;
			}
			siblings = node.children;
		}
	}
	return rootChildren;
}

/** Try a SAN move; return canonical UCI or null if illegal. Leaves `chess` unchanged. */
function tryMove(chess: Chess, san: string): string | null {
	try {
		const move = chess.move(san);
		chess.undo();
		return move.from + move.to + (move.promotion ?? '');
	} catch {
		return null;
	}
}

/** SAN without check/mate suffixes, for vocabulary matching across positions. */
const bareSan = (san: string): string => san.replace(/[+#]$/, '');

async function buildOpening(spec: OpeningSpec): Promise<OpeningTree> {
	console.log(`\n=== ${spec.name} (${spec.id}) ===`);
	requestCount = 0;
	const systemSans = new Set(spec.seedLines.flat().map(bareSan));
	const rootChildren = seedSkeleton(spec);

	// Common prefix of all seed lines: the moves (by either side) that establish
	// the opening. Along this trunk no explorer alternatives are added — e.g. a
	// Caro-Kann game only exists after 1.e4 c6.
	const trunk: string[] = [];
	for (let cur = rootChildren; cur.length === 1 && cur[0].forced; cur = cur[0].children) {
		trunk.push(cur[0].uci);
	}
	let requests = 0;
	let truncated = false;

	// BFS over positions; each visit fills `children` of the node at `path` with explorer data.
	const queue: { path: BuildNode[]; chess: Chess }[] = SEED_ONLY
		? []
		: [{ path: [], chess: new Chess() }];

	while (queue.length > 0) {
		const { path, chess } = queue.shift()!;
		const depth = path.length;
		if (depth >= spec.maxDepthPlies) continue;
		if (requests >= spec.maxRequests) {
			truncated = true;
			continue;
		}

		const children = depth === 0 ? rootChildren : path[depth - 1].children;
		let response: ExplorerResponse;
		try {
			const result = await explorerQuery(path.map((n) => n.explorerUci), spec);
			response = result.response;
			// Only fresh API calls consume the budget; cache hits are free.
			if (!result.cached) requests++;
		} catch (err) {
			if (err instanceof Error && err.message.includes('401')) throw err;
			console.warn(`  skipping node at depth ${depth}: ${err}`);
			continue;
		}

		const totalGames = response.white + response.draws + response.black;
		const minGames = Math.max(spec.minGames, Math.floor(totalGames * spec.branchFraction));

		const ranked = response.moves
			.slice()
			.sort((a, b) => b.white + b.draws + b.black - (a.white + a.draws + a.black));

		// The opening side must stay on-system: where a seed move exists it IS the
		// system (merge stats only, add nothing); elsewhere prefer moves from the
		// seed-line vocabulary so the tree can't drift into a different opening.
		let candidates = ranked;
		const onTrunk = depth < trunk.length && path.every((n, i) => n.uci === trunk[i]);
		if (onTrunk || (isOpeningSideToMove(spec, depth) && children.some((n) => n.forced))) {
			// Seed moves define the position: merge explorer stats, add nothing.
			candidates = ranked.filter((m) => {
				const move = tryMove(chess, m.san);
				return move !== null && children.some((n) => n.uci === move);
			});
		} else if (isOpeningSideToMove(spec, depth)) {
			// Unseeded node for the opening side: stay in the system vocabulary.
			const onSystem = ranked.filter((m) => systemSans.has(bareSan(m.san)));
			if (onSystem.length > 0) candidates = onSystem;
		}

		const kept = candidates
			.slice(0, spec.topMovesPerNode)
			.filter((m) => m.white + m.draws + m.black >= minGames);

		for (const m of kept) {
			// Validate SAN via chess.js and derive canonical UCI (explorer castling is e1h1-style).
			let move;
			try {
				move = chess.move(m.san);
			} catch {
				console.warn(`  explorer SAN ${m.san} illegal at depth ${depth} — skipped`);
				continue;
			}
			chess.undo();
			const uci = move.from + move.to + (move.promotion ?? '');
			let node = children.find((n) => n.uci === uci);
			if (!node) {
				node = { uci, explorerUci: m.uci, san: move.san, weight: 0, children: [] };
				children.push(node);
			}
			node.explorerUci = m.uci;
			node.weight = m.white + m.draws + m.black;
			node.wdl = { w: m.white, d: m.draws, l: m.black };
		}

		// Expand children worth expanding: explorer-kept moves and forced seed moves.
		for (const node of children) {
			const isKept = kept.some((m) => {
				const move = chess.move(m.san);
				chess.undo();
				return move.from + move.to + (move.promotion ?? '') === node.uci;
			});
			if (!isKept && !node.forced) continue;
			const nextChess = new Chess(chess.fen());
			nextChess.move(node.san);
			queue.push({ path: [...path, node], chess: nextChess });
		}
	}

	if (truncated) {
		console.warn(`  request budget (${spec.maxRequests}) hit — tree truncated at the frontier`);
	}

	finalize(rootChildren, spec, 0);
	console.log(`  ${requests} explorer requests (${requestCount} uncached), ${countNodes(rootChildren)} nodes`);

	return {
		id: spec.id,
		name: spec.name,
		side: spec.side,
		description: spec.description,
		source: `lichess explorer, ratings ${spec.ratings.join('/')}, speeds ${spec.speeds.join('/')}`,
		root: { children: rootChildren.map(stripBuildFields) }
	};
}

/**
 * Post-process: boost the opening side's forced moves to the max sibling weight
 * so a low-variability bot playing the opening actually plays its seeded
 * trap/main lines, and give unseen forced moves weight 1 so they survive
 * sampling filters.
 */
function finalize(children: BuildNode[], spec: OpeningSpec, depth: number): void {
	const maxWeight = Math.max(1, ...children.map((c) => c.weight));
	for (const node of children) {
		if (node.forced) {
			node.weight = isOpeningSideToMove(spec, depth) ? maxWeight : Math.max(node.weight, 1);
		}
		finalize(node.children, spec, depth + 1);
	}
}

function stripBuildFields(node: BuildNode): BookNode {
	const out: BookNode = {
		uci: node.uci,
		san: node.san,
		weight: node.weight,
		children: node.children.map(stripBuildFields)
	};
	if (node.wdl) out.wdl = node.wdl;
	if (node.forced) out.forced = true;
	return out;
}

function countNodes(children: BookNode[]): number {
	return children.reduce((sum, c) => sum + 1 + countNodes(c.children), 0);
}

async function main() {
	mkdirSync(CACHE_DIR, { recursive: true });
	mkdirSync(OUT_DIR, { recursive: true });
	const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
	const specs = only.length > 0 ? OPENINGS.filter((s) => only.includes(s.id)) : OPENINGS;
	if (specs.length === 0) throw new Error(`No matching openings for: ${only.join(', ')}`);
	if (SEED_ONLY) console.warn('Seed-only mode: trees contain hand-seeded lines, no explorer data.');

	const index: OpeningIndexEntry[] = [];
	for (const spec of specs) {
		const tree = await buildOpening(spec);
		writeFileSync(join(OUT_DIR, `${spec.id}.json`), JSON.stringify(tree));
		console.log(`  wrote static/openings/${spec.id}.json`);
	}
	// Index always covers the full config so partial rebuilds don't drop entries.
	for (const spec of OPENINGS) {
		index.push({
			id: spec.id,
			name: spec.name,
			side: spec.side,
			description: spec.description
		});
	}
	writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify({ openings: index }, null, '\t'));
	console.log('\nWrote static/openings/index.json');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
