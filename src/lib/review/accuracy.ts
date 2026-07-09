/**
 * Pure accuracy math, following the formulas Lichess publishes
 * (https://lichess.org/page/accuracy) and its lila source
 * (modules/analyse/src/main/AccuracyPercent.scala). Game accuracy is the mean of
 * a volatility-weighted mean and the harmonic mean of move accuracies — the
 * harmonic mean is what makes a single blunder tank the whole score, matching
 * Lichess. A plain arithmetic mean reads far too high.
 */
import type { EvalScore } from '$lib/engine/uci';
import type { Color } from '$lib/game.svelte';

export type ReviewQuality = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

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
	// The trailing +1 is in the lila source (pins a no-drop move to 100 after clamp).
	const raw = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669 + 1;
	return Math.max(0, Math.min(100, raw));
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Population standard deviation. */
function standardDeviation(xs: number[]): number {
	if (xs.length === 0) return 0;
	const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
	const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
	return Math.sqrt(variance);
}

function weightedMean(xs: number[], weights: number[]): number {
	let num = 0;
	let den = 0;
	for (let i = 0; i < xs.length; i++) {
		num += xs[i] * weights[i];
		den += weights[i];
	}
	return den === 0 ? 0 : num / den;
}

/** Harmonic mean — a single low value drags the whole result down. */
function harmonicMean(xs: number[]): number {
	if (xs.length === 0) return 0;
	let denom = 0;
	for (const x of xs) denom += 1 / x; // x === 0 → Infinity → result 0, as in lila
	return xs.length / denom;
}

/**
 * Per-move volatility weights (one per move), from the White-perspective win%
 * of every position (length = plies + 1). Weight = clamped stdev of win% in a
 * sliding window around the move; early moves reuse the first window (lila's
 * padding). This is the weighting behind Lichess's volatility-weighted mean.
 */
export function volatilityWeights(winPctsWhite: number[]): number[] {
	const n = winPctsWhite.length;
	const moveCount = n - 1;
	if (moveCount <= 0) return [];
	const windowSize = clamp(Math.floor(moveCount / 10), 2, 8);
	const windows: number[][] = [];
	const firstWindow = winPctsWhite.slice(0, windowSize);
	const fillCount = Math.max(0, Math.min(windowSize, n) - 2);
	for (let i = 0; i < fillCount; i++) windows.push(firstWindow);
	for (let i = 0; i + windowSize <= n; i++) windows.push(winPctsWhite.slice(i, i + windowSize));
	const weights = windows.map((w) => clamp(standardDeviation(w), 0.5, 12));
	// Defensive: keep exactly one weight per move for very short games.
	while (weights.length < moveCount) weights.push(0.5);
	return weights.slice(0, moveCount);
}

/**
 * Game accuracy: mean of the volatility-weighted mean and the harmonic mean of
 * the move accuracies (Lichess's method). Pass per-move `weights` from
 * {@link volatilityWeights}; omit for equal weighting.
 */
export function gameAccuracy(moveAccuracies: number[], weights?: number[]): number {
	if (moveAccuracies.length === 0) return 100;
	const w = weights ?? moveAccuracies.map(() => 1);
	const weighted = weightedMean(moveAccuracies, w);
	const harmonic = harmonicMean(moveAccuracies);
	return (weighted + harmonic) / 2;
}

/**
 * Classification by win% drop (mover perspective). "Best" is not assigned here —
 * it is reserved for playing the engine's top move (checked by move identity in
 * the analyser); a near-lossless non-top move is "excellent".
 */
export function classifyByWinDrop(winBefore: number, winAfter: number): ReviewQuality {
	const drop = winBefore - winAfter;
	if (drop <= 2) return 'excellent';
	if (drop <= 5) return 'good';
	if (drop <= 10) return 'inaccuracy';
	if (drop <= 20) return 'mistake';
	return 'blunder';
}
