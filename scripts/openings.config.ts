import type { OpeningSide } from '../src/lib/openings/types';

export interface OpeningSpec {
	id: string;
	name: string;
	/** The color that plays the opening. Trees are built symmetrically so the
	 * user can train either side ("learn to play" vs "learn to refute"). */
	side: OpeningSide;
	description: string;
	/** Hand-seeded SAN lines, always kept in the tree (forced). */
	seedLines: string[][];
	/** Lichess explorer rating buckets to include. */
	ratings: number[];
	speeds: string[];
	maxDepthPlies: number;
	/** Absolute minimum games for a move to enter the tree. */
	minGames: number;
	/** Minimum share of the parent position's games for a move to enter the tree. */
	branchFraction: number;
	/** Max explorer moves kept per node. */
	topMovesPerNode: number;
	/** Safety cap on fresh (uncached) explorer requests for this opening. */
	maxRequests: number;
}

export const OPENINGS: OpeningSpec[] = [
	{
		id: 'london',
		name: 'London System',
		side: 'white',
		description: 'The d4–Bf4 system: solid structure, easy plans, hard to break.',
		seedLines: [
			['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'e6', 'Nf3', 'c5', 'c3', 'Nc6', 'Nbd2', 'Bd6', 'Bg3'],
			['d4', 'Nf6', 'Bf4', 'e6', 'e3', 'c5', 'c3', 'd5', 'Nf3']
		],
		ratings: [1400, 1600, 1800],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 14,
		minGames: 300,
		branchFraction: 0.05,
		topMovesPerNode: 4,
		maxRequests: 400
	},
	{
		id: 'caro-kann',
		name: 'Caro-Kann Defence',
		side: 'black',
		description: 'Black meets 1.e4 with c6: Advance, Classical and Exchange structures.',
		seedLines: [
			['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6', 'Be2', 'c5'],
			['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3', 'Bg6'],
			['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'Bd3', 'Nc6', 'c3', 'Nf6']
		],
		ratings: [1400, 1600, 1800],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 14,
		minGames: 300,
		branchFraction: 0.05,
		topMovesPerNode: 4,
		maxRequests: 400
	},
	{
		id: 'wayward-queen',
		name: 'Wayward Queen Attack',
		side: 'white',
		description: '2.Qh5 and Scholar’s Mate tricks — deadly if unprepared, punishable if not.',
		seedLines: [
			// Scholar's mate threat and the clean refutation setup.
			['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'Nf6', 'g4', 'Nd4', 'Qd1'],
			// The punished defence: 3...Nf6?? loses to mate — the tree must know it.
			['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'],
			['e4', 'e5', 'Qh5', 'g6', 'Qxe5+', 'Ne7', 'Qxh8'],
			['e4', 'e5', 'Qh5', 'Nf6', 'Qxe5+', 'Qe7', 'Qxe7+', 'Bxe7']
		],
		// Low bands: high-rated players never allow these lines, so the data lives here.
		ratings: [400, 1000, 1200],
		speeds: ['bullet', 'blitz', 'rapid'],
		maxDepthPlies: 12,
		minGames: 100,
		branchFraction: 0.04,
		topMovesPerNode: 4,
		maxRequests: 300
	},
	{
		id: 'fried-liver',
		name: 'Fried Liver Attack',
		side: 'white',
		description: 'Italian with Ng5 hunting f7 — sharp play for both sides of the Two Knights.',
		seedLines: [
			// Main punishment line if Black grabs with 5...Nxd5.
			['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7', 'Kxf7', 'Qf3+', 'Ke6', 'Nc3'],
			// The correct defence 5...Na5 — theory for both sides.
			['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5', 'Bb5+', 'c6', 'dxc6', 'bxc6', 'Be2', 'h6', 'Nf3', 'e4', 'Ne5']
		],
		ratings: [1000, 1200, 1400],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 14,
		minGames: 150,
		branchFraction: 0.04,
		topMovesPerNode: 4,
		maxRequests: 400
	}
];
