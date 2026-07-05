import type { BookNode, OpeningVariation } from './types';

/**
 * Resolve the bot's next move when the user has pinned a specific sub-line.
 *
 * Returns the child to play only while `played` is a *strict* prefix of the
 * pinned path and the pinned next move is an actual book child; otherwise null
 * (the caller then falls back to normal weighted sampling).
 *
 * This single prefix test covers every interaction with one rule:
 * - user deviates → `played` is no longer a prefix → null → sampling resumes;
 * - take back → `played` shortens → prefix re-satisfied → pin auto-resumes;
 * - past the pinned leaf (`played.length >= pinned.length`) → not a strict
 *   prefix → sampling resumes.
 */
export function resolvePinnedMove(
	pinned: string[] | null,
	played: string[],
	node: { children: BookNode[] }
): BookNode | null {
	if (!pinned || played.length >= pinned.length) return null;
	for (let i = 0; i < played.length; i++) {
		if (played[i] !== pinned[i]) return null;
	}
	const nextUci = pinned[played.length];
	return node.children.find((c) => c.uci === nextUci) ?? null;
}

/** True when a pinned line is active and the game is still on it (a prefix of it). */
export function isOnPinnedLine(pinned: string[] | null, played: string[]): boolean {
	if (!pinned || played.length > pinned.length) return false;
	for (let i = 0; i < played.length; i++) {
		if (played[i] !== pinned[i]) return false;
	}
	return true;
}

/**
 * For the current position (`played`), map each named variation that branches
 * from here to its label — keyed by the variation's *next* UCI move, so the
 * fork UI can badge the sibling that begins a named line.
 */
export function namedBranchesAt(
	variations: OpeningVariation[] | undefined,
	played: string[]
): Map<string, string> {
	const out = new Map<string, string>();
	if (!variations) return out;
	for (const v of variations) {
		if (v.uci.length <= played.length) continue;
		let isPrefix = true;
		for (let i = 0; i < played.length; i++) {
			if (played[i] !== v.uci[i]) {
				isPrefix = false;
				break;
			}
		}
		if (!isPrefix) continue;
		const nextUci = v.uci[played.length];
		// First variation to claim a branch names it (main lines are listed first).
		if (!out.has(nextUci)) out.set(nextUci, v.name);
	}
	return out;
}
