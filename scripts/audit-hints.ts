/**
 * Engine-backed audit of the opening books' HINTS.
 *
 * The trainer's green "top book move" hint is the most-*played* move in the
 * Lichess data — which at club level is frequently a losing move (the reported
 * case: Fried Liver 8...Be6, played 52% of the time but hanging a piece to
 * 9.Nxe6). This script finds positions where the popular hint underperforms a
 * sibling by results (a cheap wdl prefilter), then confirms with Stockfish which
 * of those are genuinely a mistake/blunder. It proves the detector catches the
 * reported Be6 case and enumerates the others.
 *
 * The runtime fix (src/lib/trainer/hint.ts) already prevents any of these from
 * being shown to a user; this auditor is how we DETECT them in the data so the
 * books can be pruned/annotated over time.
 *
 *   npm run audit:hints                                   # default sweep
 *   HINT_AUDIT_GAP=0.04 HINT_AUDIT_MOVETIME=300 npm run audit:hints   # wider/deeper
 *
 * Scope note: the prefilter only surfaces positions where the hint's win/draw/
 * loss score trails a sibling's by >= HINT_AUDIT_GAP. A move that loses
 * tactically yet still scores well at club level (opponents don't punish it)
 * can slip through — the runtime gate, not this list, is the user-facing
 * guarantee. Exits non-zero when any popular-but-bad hint is confirmed.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { classifyMove, formatEval } from '../src/lib/trainer/classify';
import { normalizeToWhite, type EvalScore } from '../src/lib/engine/uci';
import { Engine, uciMove } from './engine-cli';
import type { BookNode, OpeningTree } from '../src/lib/openings/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const OPENINGS_DIR = join(HERE, '..', 'static', 'openings');

const MOVETIME = Number(process.env.HINT_AUDIT_MOVETIME ?? 200);
const MIN_GAMES = Number(process.env.HINT_AUDIT_MIN_GAMES ?? 500);
/** Min win/draw/loss score gap (side-to-move) for a hint to count as "suspicious". */
const GAP = Number(process.env.HINT_AUDIT_GAP ?? 0.06);
/** Below this max share of the most popular sibling a move is dropped, per sampling.ts. */
const MIN_WEIGHT_SHARE = 0.01;

interface Candidate {
	id: string;
	fen: string;
	side: 'white' | 'black';
	sideChar: 'w' | 'b';
	hintUci: string;
	hintSan: string;
	betterSan: string;
	lineSan: string;
	games: number;
	hintScore: number;
	bestScore: number;
}

/** Side-to-move expected score from White-perspective wdl counts. */
function sideScore(wdl: { w: number; d: number; l: number }, side: 'white' | 'black'): number | null {
	const tot = wdl.w + wdl.d + wdl.l;
	if (!tot) return null;
	return side === 'white' ? (wdl.w + wdl.d / 2) / tot : (wdl.l + wdl.d / 2) / tot;
}

/** Children that sampling.ts would actually consider (non-trap, forced or >=1% of max weight). */
function eligible(children: BookNode[]): BookNode[] {
	const real = children.filter((c) => !c.trap);
	if (real.length === 0) return [];
	const max = Math.max(...real.map((c) => c.weight));
	return real.filter((c) => c.forced || c.weight >= max * MIN_WEIGHT_SHARE);
}

/** Positions where the popular hint trails a sibling by results — the engine-check shortlist. */
function collectSuspicious(): Candidate[] {
	const byFen = new Map<string, Candidate>();
	for (const file of readdirSync(OPENINGS_DIR)) {
		if (!file.endsWith('.json') || file === 'index.json') continue;
		const tree = JSON.parse(readFileSync(join(OPENINGS_DIR, file), 'utf8')) as OpeningTree;

		const walk = (children: BookNode[], chess: Chess, lineSan: string) => {
			const elig = eligible(children);
			if (elig.length > 0) {
				const side = chess.turn() === 'w' ? 'white' : 'black';
				const hint = elig.reduce((a, b) => (b.weight > a.weight ? b : a));
				const scored = elig
					.filter((c) => c.wdl && c.wdl.w + c.wdl.d + c.wdl.l >= MIN_GAMES)
					.map((c) => ({ c, s: sideScore(c.wdl!, side)! }));
				const hintScore = hint.wdl ? sideScore(hint.wdl, side) : null;
				if (scored.length > 0 && hintScore !== null && hint.weight >= MIN_GAMES) {
					const best = scored.reduce((a, b) => (b.s > a.s ? b : a));
					if (best.c.uci !== hint.uci && best.s - hintScore >= GAP) {
						const fen = chess.fen();
						const prev = byFen.get(fen);
						if (!prev || hint.weight > prev.games) {
							byFen.set(fen, {
								id: tree.id,
								fen,
								side,
								sideChar: chess.turn(),
								hintUci: hint.uci,
								hintSan: hint.san,
								betterSan: best.c.san,
								lineSan: `${lineSan} ${hint.san}`.trim(),
								games: hint.weight,
								hintScore,
								bestScore: best.s
							});
						}
					}
				}
			}
			for (const child of children) {
				const next = new Chess(chess.fen());
				next.move(uciMove(child.uci));
				walk(child.children, next, `${lineSan} ${child.san}`.trim());
			}
		};
		walk(tree.root.children, new Chess(), '');
	}
	return [...byFen.values()].sort((a, b) => b.games - a.games);
}

async function main() {
	const suspicious = collectSuspicious();
	console.log(
		`Prefilter: ${suspicious.length} positions where the popular hint trails a sibling ` +
			`by >= ${GAP} score (games >= ${MIN_GAMES}). Confirming with Stockfish @ ${MOVETIME}ms...\n`
	);

	const engine = new Engine();
	await engine.start();

	const findings: Array<Candidate & { quality: string; evalStr: string }> = [];
	let done = 0;
	for (const c of suspicious) {
		const before = await engine.evaluate(c.fen, MOVETIME);
		if (before.bestUci !== c.hintUci) {
			const chess = new Chess(c.fen);
			let quality = 'ok';
			let afterWhite: EvalScore = {};
			try {
				chess.move(uciMove(c.hintUci));
				if (!chess.isCheckmate()) {
					const after = await engine.evaluate(chess.fen(), MOVETIME);
					afterWhite = normalizeToWhite(after.score, chess.turn());
					quality = classifyMove(normalizeToWhite(before.score, c.sideChar), afterWhite, c.side);
				}
			} catch {
				/* illegal — skip */
			}
			if (quality === 'mistake' || quality === 'blunder') {
				findings.push({
					...c,
					quality,
					evalStr: `${formatEval(normalizeToWhite(before.score, c.sideChar))} -> ${formatEval(afterWhite)}`
				});
			}
		}
		if (++done % 10 === 0 || done === suspicious.length) {
			process.stdout.write(`\r  confirmed ${done}/${suspicious.length}`);
		}
	}
	engine.quit();
	process.stdout.write('\n\n');

	findings.sort((a, b) => b.games - a.games);
	console.log(`=== ${findings.length} popular-but-bad hint(s) confirmed by the engine ===\n`);
	for (const f of findings) {
		console.log(
			`[${f.id}] ${f.quality.toUpperCase()} — hint ${f.hintSan} ${f.evalStr}; ` +
				`prefer ${f.betterSan} (${f.games} games at this position)`
		);
		console.log(`   ${f.lineSan}`);
	}

	const be6 = findings.find(
		(f) => f.id === 'fried-liver' && f.hintSan === 'Be6' && f.lineSan.endsWith('Nxc6 Bc4 Be6')
	);
	const be6InScope = suspicious.some(
		(c) => c.id === 'fried-liver' && c.hintSan === 'Be6' && c.lineSan.endsWith('Nxc6 Bc4 Be6')
	);
	console.log('');
	if (be6) {
		console.log('✓ detector flagged the reported Fried Liver 8...Be6 case');
	} else if (be6InScope) {
		console.log('✗ reported Be6 case was in scope but NOT confirmed — detector regression!');
		process.exitCode = 2;
	} else {
		console.log('(reported Be6 position fell outside the prefilter — lower HINT_AUDIT_GAP)');
	}

	if (findings.length > 0 && !process.exitCode) process.exitCode = 1;
}

main().catch((e) => {
	console.error(e);
	process.exit(3);
});
