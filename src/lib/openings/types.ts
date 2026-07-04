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
	children: BookNode[];
}

export interface OpeningTree {
	id: string;
	name: string;
	/** Side the opening belongs to; the user can train either playing or refuting it. */
	side: OpeningSide;
	description?: string;
	/** Provenance of the data (explorer query summary). */
	source: string;
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
