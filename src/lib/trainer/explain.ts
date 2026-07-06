import { Chess, type Square } from 'chess.js';
import type { Color } from '$lib/game.svelte';

/**
 * "Why was this move bad": the engine move that should have been played, the
 * opponent's strongest punish line, and — when one can be read off that line
 * with confidence — the tactical motif (hung piece, fork, allowed mate...).
 * Built purely from data the grader already has (the before/after evals carry
 * bestUci and pv), so explaining a move costs no extra engine time.
 */
export interface Explanation {
	/** SAN of the engine's best move in the position before the user's move. */
	bestSan: string | null;
	/** UCI of that move, for drawing an arrow on the before-position. */
	bestUci: string | null;
	/** Opponent's punish line in numbered SAN, e.g. "13...Qxb2 14.Rb1 Qxa2". */
	refutationLine: string | null;
	/** First move of the punish line, for drawing an arrow on the after-position. */
	refutationUci: string | null;
	/** The engine's best line from the before-position, steppable on a board. */
	bestLine: LineStep[];
	/** The punish line from the after-position, steppable on a board. */
	refutation: LineStep[];
	/** Tactical motif read off the punish line, when one is clear. */
	motif: Motif | null;
	/** Human sentence for the motif, e.g. "This hangs your queen on h5." */
	reason: string | null;
}

/** One ply of an engine line. Superset of PlayedMove, so a whole line can be
 * browsed with the same positionAt() machinery as the game itself. */
export interface LineStep {
	san: string;
	uci: string;
	/** PGN-style token for display, e.g. "13...Qxb2" or "Rb1". */
	numbered: string;
	fenBefore: string;
	fenAfter: string;
}

export type Motif =
	| { kind: 'allows-mate'; mateIn: number }
	| { kind: 'missed-mate'; mateIn: number }
	/** The punish line starts by winning this piece outright. `justMoved`: it is
	 * the piece the user just moved (hung it) vs. one left behind undefended. */
	| { kind: 'hangs-piece'; piece: PieceType; square: string; justMoved: boolean }
	/** The punish move attacks two or more high-value/undefended pieces at once. */
	| { kind: 'fork'; san: string; targets: PieceType[] }
	/** The punish line wins material through an exchange sequence. */
	| { kind: 'loses-material'; lost: PieceType[]; won: PieceType[]; net: number };

type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/** Keep punish lines short enough to read at a glance (three full moves). */
const MAX_REFUTATION_PLIES = 6;
/** Material accounting looks deeper so exchange sequences resolve. */
const MAX_MATERIAL_PLIES = 12;

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const NAME: Record<PieceType, string> = {
	p: 'pawn',
	n: 'knight',
	b: 'bishop',
	r: 'rook',
	q: 'queen',
	k: 'king'
};

interface LineMove extends LineStep {
	color: 'w' | 'b';
	to: Square;
	captured?: PieceType;
	promotion?: PieceType;
}

/** Play a UCI pv out from `fen`, stopping at the first illegal move. */
function playLine(fen: string, ucis: readonly string[], maxPlies: number): LineMove[] {
	let chess: Chess;
	try {
		chess = new Chess(fen);
	} catch {
		return [];
	}
	const out: LineMove[] = [];
	for (const uci of ucis.slice(0, maxPlies)) {
		const white = chess.turn() === 'w';
		const num = chess.moveNumber();
		const fenBefore = chess.fen();
		let m;
		try {
			m = chess.move({
				from: uci.slice(0, 2),
				to: uci.slice(2, 4),
				promotion: uci.slice(4, 5) || undefined
			});
		} catch {
			break; // pv disagrees with the position (stale line) — keep the trusted prefix
		}
		// PGN-style numbering: "13.Qb2" for White, "13...Qxb2" when Black starts the line.
		const numbered = white ? `${num}.${m.san}` : out.length === 0 ? `${num}...${m.san}` : m.san;
		out.push({
			san: m.san,
			uci,
			numbered,
			fenBefore,
			fenAfter: chess.fen(),
			color: m.color,
			to: m.to,
			captured: m.captured as PieceType | undefined,
			promotion: m.promotion as PieceType | undefined
		});
	}
	return out;
}

/** A pv as one numbered SAN string, e.g. "1.e4 e5 2.Nf3"; null if none of it is legal. */
export function numberedLine(
	fen: string,
	ucis: readonly string[],
	maxPlies = MAX_REFUTATION_PLIES
): string | null {
	const moves = playLine(fen, ucis, maxPlies);
	return moves.length > 0 ? moves.map((m) => m.numbered).join(' ') : null;
}

/** Signed mate distance from the user's side (+n = user mates in n), 0 if no mate. */
function mateFor(score: { mate?: number }, side: Color): number {
	if (score.mate === undefined) return 0;
	return side === 'white' ? score.mate : -score.mate;
}

/** Net material for the user over a played-out line, plus what changed hands. */
function materialBalance(line: LineMove[], userColor: 'w' | 'b') {
	let net = 0;
	const lost: PieceType[] = [];
	const won: PieceType[] = [];
	for (const m of line) {
		const mine = m.color === userColor;
		if (m.captured) {
			if (mine) {
				won.push(m.captured);
				net += VALUE[m.captured];
			} else {
				lost.push(m.captured);
				net -= VALUE[m.captured];
			}
		}
		if (m.promotion) net += (VALUE[m.promotion] - VALUE.p) * (mine ? 1 : -1);
	}
	return { net, lost, won };
}

/** User pieces the piece on `sq` attacks that make a fork target: the king,
 * anything worth more than the attacker, or an undefended minor-or-better. */
function forkTargets(chess: Chess, sq: Square, userColor: 'w' | 'b'): PieceType[] {
	const attacker = chess.get(sq);
	if (!attacker) return [];
	const av = VALUE[attacker.type] ?? 0;
	const targets: PieceType[] = [];
	for (const row of chess.board()) {
		for (const cell of row) {
			if (!cell || cell.color !== userColor) continue;
			if (!chess.attackers(cell.square, attacker.color).includes(sq)) continue;
			const defended = chess.attackers(cell.square, userColor).length > 0;
			const worthIt =
				cell.type === 'k' || VALUE[cell.type] > av || (!defended && VALUE[cell.type] >= 3);
			if (worthIt) targets.push(cell.type);
		}
	}
	// King first, then by value, so "king and rook" reads naturally.
	return targets.sort((a, b) => (a === 'k' ? -1 : b === 'k' ? 1 : VALUE[b] - VALUE[a]));
}

/** Human sentence for a motif; null-safe passthrough. */
export function motifText(motif: Motif | null): string | null {
	if (!motif) return null;
	switch (motif.kind) {
		case 'allows-mate':
			return motif.mateIn === 1
				? 'This allows immediate checkmate.'
				: `This allows forced mate in ${motif.mateIn}.`;
		case 'missed-mate':
			return motif.mateIn === 1
				? 'You missed a checkmate in one.'
				: `You missed a forced mate in ${motif.mateIn}.`;
		case 'hangs-piece':
			return motif.justMoved
				? `This hangs your ${NAME[motif.piece]} on ${motif.square}.`
				: `This leaves your ${NAME[motif.piece]} on ${motif.square} hanging.`;
		case 'fork': {
			const names = motif.targets.map((t) => NAME[t]);
			const list =
				names.length === 2 && names[0] === names[1]
					? `two ${names[0]}s`
					: names.join(' and ');
			return `${motif.san} forks your ${list}.`;
		}
		case 'loses-material': {
			if (motif.net === -2 && motif.lost.includes('r') && motif.won.some((w) => w === 'b' || w === 'n')) {
				return 'This loses the exchange.';
			}
			// Cancel even trades (same type first, then same value like N-for-B),
			// then name the heaviest uncompensated loss.
			const lost = [...motif.lost].sort((a, b) => VALUE[b] - VALUE[a]);
			const won = [...motif.won].sort((a, b) => VALUE[b] - VALUE[a]);
			for (const match of [(w: string, l: string) => w === l, (w: string, l: string) => VALUE[w] === VALUE[l]]) {
				for (let i = lost.length - 1; i >= 0; i--) {
					const j = won.findIndex((w) => match(w, lost[i]));
					if (j !== -1) {
						lost.splice(i, 1);
						won.splice(j, 1);
					}
				}
			}
			const heaviest = lost[0];
			if (!heaviest) return 'This loses material.';
			if (heaviest === 'p') {
				const n = lost.filter((l) => l === 'p').length;
				return n > 1 ? `This loses ${n} pawns.` : 'This loses a pawn.';
			}
			return `This loses your ${NAME[heaviest]}${won[0] ? ` for a ${NAME[won[0]]}` : ''}.`;
		}
	}
}

/**
 * Read a tactical motif off the punish line. The pv is the engine's best play
 * for both sides, so a capture/fork found on it is a real tactic, not a
 * speculative one. Returns null when nothing is clear enough to name —
 * callers fall back to the generic eval-swing wording.
 */
export function detectMotif(
	played: { fenBefore: string; fenAfter: string; uci: string },
	before: { mate?: number },
	after: { mate?: number; pv?: readonly string[] },
	side: Color
): Motif | null {
	const beforeMate = mateFor(before, side);
	const afterMate = mateFor(after, side);
	// Newly walking into a mate outranks everything (it decides the game).
	if (afterMate < 0 && beforeMate >= 0) return { kind: 'allows-mate', mateIn: -afterMate };
	if (beforeMate > 0 && afterMate <= 0) return { kind: 'missed-mate', mateIn: beforeMate };

	const line = after.pv ? playLine(played.fenAfter, after.pv, MAX_MATERIAL_PLIES) : [];
	if (line.length === 0) return null;
	const userColor = side === 'white' ? 'w' : 'b';
	const first = line[0];

	// Material accounting is only trustworthy when the line ends quietly — a pv
	// cut off mid-exchange would count a capture whose recapture we never saw.
	const resolved = !line[line.length - 1].captured;
	const { net, lost, won } = resolved ? materialBalance(line, userColor) : { net: 0, lost: [], won: [] };

	// Hung piece: the punish line opens by winning a piece more or less for free.
	if (first.captured && VALUE[first.captured] >= 3 && net <= -(VALUE[first.captured] - 1)) {
		return {
			kind: 'hangs-piece',
			piece: first.captured,
			square: first.to,
			justMoved: first.to === played.uci.slice(2, 4)
		};
	}

	// Fork: the punish move attacks two or more valuable/undefended pieces at once.
	const chess = new Chess(played.fenAfter);
	try {
		chess.move({
			from: first.uci.slice(0, 2),
			to: first.uci.slice(2, 4),
			promotion: first.uci.slice(4, 5) || undefined
		});
		const targets = forkTargets(chess, first.to, userColor);
		if (targets.length >= 2) return { kind: 'fork', san: first.san, targets };
	} catch {
		// unreachable: playLine already validated the move
	}

	// Exchange sequence that ends at least two pawns of material down.
	if (net <= -2) return { kind: 'loses-material', lost, won, net };
	return null;
}

/**
 * Explain a flagged move from the grader's before/after evals: what should
 * have been played (`before.bestUci`), how the opponent punishes what was
 * played (`after.pv`), and the tactical motif when one is clear. Returns null
 * when the evals carry nothing to show.
 */
export function explainMove(
	played: { fenBefore: string; fenAfter: string; uci: string },
	before: { bestUci?: string | null; mate?: number; pv?: readonly string[] },
	// The after-eval may be a bare terminal score (no pv when the game just ended).
	after: { cp?: number; mate?: number; pv?: readonly string[] },
	side: Color
): Explanation | null {
	const toStep = ({ san, uci, numbered, fenBefore, fenAfter }: LineMove): LineStep => ({
		san,
		uci,
		numbered,
		fenBefore,
		fenAfter
	});

	// The best line: the full pv when it starts with bestUci, else just that move.
	let bestLine: LineStep[] = [];
	if (before.bestUci && before.bestUci !== played.uci) {
		const pv = before.pv?.[0] === before.bestUci ? before.pv : [before.bestUci];
		bestLine = playLine(played.fenBefore, pv, MAX_REFUTATION_PLIES).map(toStep);
	}
	const bestSan = bestLine[0]?.san ?? null;
	const bestUci = bestLine[0]?.uci ?? null;

	const punish = after.pv ? playLine(played.fenAfter, after.pv, MAX_REFUTATION_PLIES) : [];
	const refutation = punish.map(toStep);
	const refutationLine = punish.length > 0 ? punish.map((m) => m.numbered).join(' ') : null;
	const refutationUci = punish[0]?.uci ?? null;

	const motif = detectMotif(played, before, after, side);
	// "You missed mate in N" reads best with the mating move attached.
	const reason =
		motif?.kind === 'missed-mate' && bestSan
			? motifText(motif)!.replace(/\.$/, ` starting with ${bestSan}.`)
			: motifText(motif);

	if (!bestSan && !refutationLine && !motif) return null;
	return { bestSan, bestUci, refutationLine, refutationUci, bestLine, refutation, motif, reason };
}
