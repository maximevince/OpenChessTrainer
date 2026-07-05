/**
 * Hand-off from the trainer to the review viewer: "analyse this game".
 * Set before navigating to /review, consumed there (one-shot).
 */
import { oneShot } from '$lib/oneshot';
import type { Color, PlayedMove } from '$lib/game.svelte';
import type { ViewerGame } from './fetch';

export interface ReviewRequest {
	game: ViewerGame;
	moves: PlayedMove[];
	/** Show the board from this side's perspective (the side the user played). */
	orientation: Color;
}

const channel = oneShot<ReviewRequest>();

export const setReviewRequest = channel.set;
export const takeReviewRequest = channel.take;
