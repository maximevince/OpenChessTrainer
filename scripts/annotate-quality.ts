/**
 * Build-time quality annotation for the low-band trap books.
 *
 * At club level the most-*played* move is frequently a mistake, so when a user
 * plays a merely-popular (unendorsed) book move the trainer has to grade it with
 * the engine. Doing that live means two 400ms probes whose verdict can land a
 * second after the move and flip the badge — nondeterministic and janky.
 *
 * This script pre-computes Stockfish's evaluation of every reachable position in
 * the trap books and writes it onto the nodes (`eval`, White perspective). The
 * trainer then grades a reply from the stored before/after evals instantly and
 * deterministically (src/lib/trainer/trainer.svelte.ts), and serves book hints
 * without a probe too. Off-book moves still fall back to the live engine.
 *
 *   npm run annotate:quality
 *   ANNOTATE_MOVETIME=400 ANNOTATE_ONLY=fried-liver npm run annotate:quality
 *
 * Idempotent: re-running overwrites the evals. Scoped to the books listed below
 * (the ones whose data is low-rating trap lines); mainline repertoires trust
 * their curated endorsements and are not annotated.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { Chess } from 'chess.js';
import { Engine, uciMove } from './engine-cli';
import type { BookNode, NodeEval, OpeningTree } from '../src/lib/openings/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const OPENINGS_DIR = join(HERE, '..', 'static', 'openings');

/** Low-band trap books: popularity here is a weak proxy for quality. */
const BOOKS = ['wayward-queen', 'napoleon', 'greco-defense', 'englund', 'fried-liver', 'bishop-scholar'];

const MOVETIME = Number(process.env.ANNOTATE_MOVETIME ?? 250);
const WORKERS = Math.max(1, Number(process.env.ANNOTATE_WORKERS ?? Math.max(1, cpus().length - 2)));
/** Below this share of the top sibling's weight a move is dropped, per sampling.ts. */
const MIN_WEIGHT_SHARE = 0.01;

/** Children sampling.ts would actually present (non-trap, forced or >=1% of max weight). */
function eligible(children: BookNode[]): BookNode[] {
	const real = children.filter((c) => !c.trap);
	if (real.length === 0) return [];
	const max = Math.max(...real.map((c) => c.weight));
	return real.filter((c) => c.forced || c.weight >= max * MIN_WEIGHT_SHARE);
}

interface Job {
	/** Node to write the eval onto; null for the root (starting position). */
	node: BookNode | null;
	tree: OpeningTree;
	fen: string;
	sideChar: 'w' | 'b';
}

/** The root plus every eligible node reachable through eligible children. Each
 * job's fen is the position AFTER the node's move — the "before" for its own
 * children and the "after" for the move that reached it. */
function collectJobs(tree: OpeningTree): Job[] {
	const jobs: Job[] = [];
	const chess = new Chess();
	jobs.push({ node: null, tree, fen: chess.fen(), sideChar: 'w' });
	const walk = (children: BookNode[]) => {
		for (const child of eligible(children)) {
			chess.move(uciMove(child.uci));
			jobs.push({ node: child, tree, fen: chess.fen(), sideChar: chess.turn() });
			walk(child.children);
			chess.undo();
		}
	};
	walk(tree.root.children);
	return jobs;
}

/** Compact eval record: cp XOR mate, plus the best move (dropped at mate/stalemate). */
function toNodeEval(score: { cp?: number; mate?: number }, bestUci: string | null): NodeEval {
	const out: NodeEval = {};
	if (score.mate !== undefined) out.mate = score.mate;
	else out.cp = Math.round(score.cp ?? 0);
	if (bestUci) out.bestUci = bestUci;
	return out;
}

async function main() {
	const only = process.env.ANNOTATE_ONLY?.split(',').map((s) => s.trim());
	const books = only ? BOOKS.filter((b) => only.includes(b)) : BOOKS;

	const trees = new Map<string, OpeningTree>();
	const jobs: Job[] = [];
	for (const id of books) {
		const path = join(OPENINGS_DIR, `${id}.json`);
		const tree = JSON.parse(readFileSync(path, 'utf8')) as OpeningTree;
		trees.set(id, tree);
		jobs.push(...collectJobs(tree));
	}
	console.log(
		`Annotating ${books.length} book(s): ${jobs.length} positions ` +
			`@ ${MOVETIME}ms across ${WORKERS} engine(s)...`
	);

	const engines = await Promise.all(
		Array.from({ length: WORKERS }, async () => {
			const e = new Engine();
			await e.start();
			return e;
		})
	);

	let next = 0;
	let done = 0;
	const worker = async (engine: Engine) => {
		for (;;) {
			const i = next++;
			if (i >= jobs.length) return;
			const job = jobs[i];
			const { bestUci, score } = await engine.evaluateWhite(job.fen, MOVETIME, job.sideChar);
			const record = toNodeEval(score, bestUci);
			if (job.node) job.node.eval = record;
			else job.tree.root.eval = record;
			if (++done % 100 === 0 || done === jobs.length) {
				process.stdout.write(`\r  evaluated ${done}/${jobs.length}`);
			}
		}
	};
	await Promise.all(engines.map(worker));
	for (const e of engines) e.quit();
	process.stdout.write('\n');

	for (const id of books) {
		const tree = trees.get(id)!;
		writeFileSync(join(OPENINGS_DIR, `${id}.json`), JSON.stringify(tree));
		console.log(`  wrote ${id}.json`);
	}
	console.log('Done.');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
