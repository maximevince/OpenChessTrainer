/**
 * Hand-off from the review viewer to the trainer: "practice this position".
 * Plain module state — set before navigating to /train, consumed there.
 * Lost on a hard refresh, which is fine: the user just returns to review.
 */
export interface PracticeRequest {
	fen: string;
	/** Human context, e.g. "vnz0r – Rsihag, move 21". */
	label: string;
}

let current: PracticeRequest | null = null;

export function setPractice(req: PracticeRequest): void {
	current = req;
}

export function getPractice(): PracticeRequest | null {
	return current;
}

export function clearPractice(): void {
	current = null;
}
