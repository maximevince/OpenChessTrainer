/**
 * Hand-off from the trainer to the review viewer: "analyse this game".
 * Plain module state — set before navigating to /review, consumed there.
 * Lost on a hard refresh, which is fine: the user just returns to train.
 */
import type { Color, PlayedMove } from '$lib/game.svelte';
import type { ViewerGame } from './fetch';

export interface ReviewRequest {
	game: ViewerGame;
	moves: PlayedMove[];
	/** Show the board from this side's perspective (the side the user played). */
	orientation: Color;
}

let current: ReviewRequest | null = null;

export function setReviewRequest(req: ReviewRequest): void {
	current = req;
}

/** Consume the pending request (one-shot). */
export function takeReviewRequest(): ReviewRequest | null {
	const req = current;
	current = null;
	return req;
}
