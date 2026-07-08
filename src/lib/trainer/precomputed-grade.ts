/** Read build-time node evals (annotate-quality.ts) back into the runtime
 * grading path, so an in-book reply is graded and hinted without a live probe. */
import type { EvalScore } from '$lib/engine/uci';
import type { NodeEval } from '$lib/openings/types';

/** A stored node eval shaped like the trainer's engine.evaluate result
 * (`bestUci` always present, null when the position has no move). */
export function toEvalScore(e: NodeEval): EvalScore & { bestUci: string | null } {
	const s: EvalScore & { bestUci: string | null } = { bestUci: e.bestUci ?? null };
	if (e.mate !== undefined) s.mate = e.mate;
	else if (e.cp !== undefined) s.cp = e.cp;
	return s;
}

/** Before/after evals for a move, drawn from the parent and child node annotations.
 * Null unless BOTH are present (an unannotated book, or an off-book move). */
export function precomputedEvals(
	before: NodeEval | undefined,
	after: NodeEval | undefined
): { before: EvalScore & { bestUci: string | null }; after: EvalScore } | null {
	if (!before || !after) return null;
	return { before: toEvalScore(before), after: toEvalScore(after) };
}
