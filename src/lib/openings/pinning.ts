import type { BookNode, OpeningVariation } from './types';

/** True when `prefix` matches the start of `seq` (i.e. `seq` begins with `prefix`). */
export function isPrefixOf(prefix: readonly string[], seq: readonly string[]): boolean {
	if (prefix.length > seq.length) return false;
	for (let i = 0; i < prefix.length; i++) {
		if (prefix[i] !== seq[i]) return false;
	}
	return true;
}

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
	if (!pinned || played.length >= pinned.length || !isPrefixOf(played, pinned)) return null;
	const nextUci = pinned[played.length];
	return node.children.find((c) => c.uci === nextUci) ?? null;
}

/** True when a pinned line is active and the game is still on it (a prefix of it). */
export function isOnPinnedLine(pinned: string[] | null, played: string[]): boolean {
	return pinned !== null && isPrefixOf(played, pinned);
}

/**
 * Full "drill from here" path for a fork choice: the chosen child followed by
 * the most popular (argmax weight) continuation down to a book leaf. Ties keep
 * the first sibling, so the result is deterministic.
 */
export function mainLinePath(played: string[], start: BookNode): string[] {
	const path = [...played, start.uci];
	for (let cur = start; cur.children.length > 0; ) {
		cur = cur.children.reduce((best, c) => (c.weight > best.weight ? c : best));
		path.push(cur.uci);
	}
	return path;
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
		if (v.uci.length <= played.length || !isPrefixOf(played, v.uci)) continue;
		const nextUci = v.uci[played.length];
		// First variation to claim a branch names it (main lines are listed first).
		if (!out.has(nextUci)) out.set(nextUci, v.name);
	}
	return out;
}
