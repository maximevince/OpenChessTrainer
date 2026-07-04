import type { EvalScore } from '$lib/engine/uci';
import type { Color } from '$lib/game.svelte';

export type MoveQuality = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/** Virtual cp magnitude representing a forced mate, beyond any real evaluation. */
const MATE_CP = 10_000;
const MATE_THRESHOLD = 9_000;

/**
 * Score in centipawns from the given side's perspective.
 * Forced mates map just beyond the cp scale (closer mate = higher magnitude).
 */
export function toSideCp(score: EvalScore, side: Color): number {
	const sign = side === 'white' ? 1 : -1;
	if (score.mate !== undefined) {
		const mate = score.mate * sign;
		return mate > 0 ? MATE_CP - mate : -MATE_CP - mate;
	}
	return (score.cp ?? 0) * sign;
}

/**
 * Classify a user move from full-strength evals before/after it (White-perspective
 * scores, as produced by engine.evaluate). Delta thresholds per the trainer spec:
 * ≤20 Best, ≤60 Good, ≤120 Inaccuracy, ≤250 Mistake, >250 Blunder.
 * Throwing away a forced mate or newly allowing one is always a Blunder.
 */
export function classifyMove(before: EvalScore, after: EvalScore, userSide: Color): MoveQuality {
	const cpBefore = toSideCp(before, userSide);
	const cpAfter = toSideCp(after, userSide);
	if (cpBefore > MATE_THRESHOLD && cpAfter <= MATE_THRESHOLD) return 'blunder'; // threw a mate
	if (cpAfter < -MATE_THRESHOLD && cpBefore >= -MATE_THRESHOLD) return 'blunder'; // allowed a mate
	const loss = cpBefore - cpAfter;
	if (loss <= 20) return 'best';
	if (loss <= 60) return 'good';
	if (loss <= 120) return 'inaccuracy';
	if (loss <= 250) return 'mistake';
	return 'blunder';
}

/** Human-readable eval from White's perspective, e.g. "+0.35", "-1.20", "#3", "#-2". */
export function formatEval(score: EvalScore): string {
	if (score.mate !== undefined) return score.mate >= 0 ? `#${score.mate}` : `#-${-score.mate}`;
	const pawns = (score.cp ?? 0) / 100;
	return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
}
