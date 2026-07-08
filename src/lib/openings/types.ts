/** The color that "owns" the opening (White for the London, Black for the Caro-Kann…). */
export type OpeningSide = 'white' | 'black';

export interface BookNode {
	uci: string;
	san: string;
	/** Number of explorer games that reached this move (sampling weight). */
	weight: number;
	/** Win/draw/loss counts from White's perspective, if known. */
	wdl?: { w: number; d: number; l: number };
	/** Hand-seeded line move: never pruned, kept regardless of popularity. */
	forced?: boolean;
	/** A punished move: in the book so the bot can exploit it, NOT a recommendation. */
	trap?: boolean;
	/** Endorsed move for whichever side is to move here (a node's move belongs
	 * to one side by parity): the repertoire's PGN-mainline pick, or a named
	 * line's `recommend` side. At most one recommended move per sibling group. */
	recommended?: boolean;
	/** Authored explanation from the repertoire PGN, shown when training. */
	comment?: string;
	children: BookNode[];
}

/** Semantic label for a named variation (compact tag in the fork UI). */
export type OpeningVariationKind =
	| 'chapter'
	| 'mainline'
	| 'refutation'
	| 'trap'
	| 'counterplay';

/** A hand-named line the user can pick and drill: a full UCI path from the start. */
export interface OpeningVariation {
	name: string;
	/** UCI moves from the initial position along this line. */
	uci: string[];
	/** A punished line (one side exploits the other's error), not a recommendation. */
	trap?: boolean;
	/** Chapter introduction from the repertoire PGN (shown in the picker). */
	intro?: string;
	/** Cluster of related lines (picker optgroup, fork-label prefix). */
	group?: string;
	kind?: OpeningVariationKind;
}

export interface OpeningTree {
	id: string;
	name: string;
	/** Side the opening belongs to; the user can train either playing or refuting it. */
	side: OpeningSide;
	description?: string;
	/** Provenance of the data (explorer query summary). */
	source: string;
	/** Hand-named lines for the setup picker / fork labels; absent on older books. */
	variations?: OpeningVariation[];
	root: { children: BookNode[] };
}

export interface OpeningIndexEntry {
	id: string;
	name: string;
	side: OpeningSide;
	description?: string;
}

export interface OpeningIndex {
	openings: OpeningIndexEntry[];
}
