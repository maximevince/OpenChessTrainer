/**
 * Hand-off from the review viewer to the trainer: "practice this position".
 * Set before navigating to /train, read there (and cleared on leaving practice).
 */
import { oneShot } from '$lib/oneshot';
import type { PlayedMove } from '$lib/game.svelte';

export interface PracticeRequest {
	fen: string;
	/** Human context, e.g. "vnz0r - Rsihag, move 21". ASCII only — it ends up in PGN tags. */
	label: string;
	/** Moves that led to `fen`, so the trainer can show/browse them (view-only). */
	moves?: PlayedMove[];
}

const channel = oneShot<PracticeRequest>();

export const setPractice = channel.set;
export const getPractice = channel.peek;
export const clearPractice = channel.clear;
