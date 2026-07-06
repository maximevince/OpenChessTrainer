import type { EvalScore } from '$lib/engine/uci';
import type { Color } from '$lib/game.svelte';
import { classifyMove } from './classify';

export interface HintChoice {
	uci: string;
	source: 'book' | 'engine';
	/** Set when a book move existed here but graded too poorly to recommend. */
	bookRejected?: boolean;
}

/**
 * Decide which move to hint, given the engine's read of the position.
 *
 * The opening book stores how *often* a move is played, not how *good* it is —
 * and at club level the most-played move is frequently losing (e.g. the Fried
 * Liver's 8...Be6, played 52% of the time but hanging a piece to 9.Nxe6). So a
 * book move is only trusted when the engine agrees it is no worse than "good":
 * either it IS the engine's best move, or playing it loses little eval. Anything
 * worse falls back to the engine's own best move (shown as the blue arrow).
 *
 * Pure so it can be unit-tested without a live engine.
 *
 * @param topUci   the most-popular book move at this position, or null if none
 * @param best     full-strength eval of the position (White-perspective, with bestUci)
 * @param bookAfter eval after playing `topUci` (White-perspective), or null when unknown
 * @param side     the side to move (whose hint this is)
 * @param bookUcis UCIs of the book moves here, so the engine's pick still counts as
 *                 "book" (green) when it is itself a book move (e.g. an unpopular refutation)
 */
export function chooseHint(
	topUci: string | null,
	best: EvalScore & { bestUci: string | null },
	bookAfter: EvalScore | null,
	side: Color,
	bookUcis: readonly string[] = []
): HintChoice | null {
	if (topUci) {
		if (best.bestUci && topUci === best.bestUci) return { uci: topUci, source: 'book' };
		if (bookAfter) {
			const quality = classifyMove(best, bookAfter, side);
			if (quality === 'best' || quality === 'good') return { uci: topUci, source: 'book' };
		}
	}
	if (best.bestUci) {
		// The engine's move is still "book" when it's one of this position's book moves.
		const source = bookUcis.includes(best.bestUci) ? 'book' : 'engine';
		if (source === 'engine' && topUci) return { uci: best.bestUci, source, bookRejected: true };
		return { uci: best.bestUci, source };
	}
	// No engine move (shouldn't happen for a legal position): fall back to the book move if any.
	return topUci ? { uci: topUci, source: 'book' } : null;
}
