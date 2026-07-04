/**
 * Pure accuracy math, following the formulas Lichess publishes
 * (https://lichess.org/page/accuracy). Game accuracy uses a plain mean of
 * move accuracies — a documented approximation of Lichess's windowed version.
 */
import type { EvalScore } from '$lib/engine/uci';
import type { Color } from '$lib/game.svelte';

export type ReviewQuality = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

const CP_CLAMP = 1000;

/** Win probability (0–100) for White from a White-perspective eval. Mates clamp the scale. */
export function winPct(score: EvalScore): number {
	let cp: number;
	if (score.mate !== undefined) {
		cp = score.mate > 0 ? CP_CLAMP : -CP_CLAMP;
	} else {
		cp = Math.max(-CP_CLAMP, Math.min(CP_CLAMP, score.cp ?? 0));
	}
	return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Win probability for the given side. */
export function winPctFor(score: EvalScore, side: Color): number {
	const w = winPct(score);
	return side === 'white' ? w : 100 - w;
}

/** Accuracy (0–100) of a single move from the mover's win% before/after. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
	const drop = Math.max(0, winBefore - winAfter);
	const raw = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
	return Math.max(0, Math.min(100, raw));
}

/** Game accuracy: plain mean of move accuracies (documented approximation). */
export function gameAccuracy(moveAccuracies: number[]): number {
	if (moveAccuracies.length === 0) return 100;
	return moveAccuracies.reduce((a, b) => a + b, 0) / moveAccuracies.length;
}

/** Classification by win% drop (mover perspective). */
export function classifyByWinDrop(winBefore: number, winAfter: number): ReviewQuality {
	const drop = winBefore - winAfter;
	if (drop <= 2) return 'best';
	if (drop <= 5) return 'good';
	if (drop <= 10) return 'inaccuracy';
	if (drop <= 20) return 'mistake';
	return 'blunder';
}
