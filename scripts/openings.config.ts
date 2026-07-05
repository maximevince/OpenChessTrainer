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
	/**
	 * Hand-seeded PUNISHED lines (also forced): the opening side exploits a
	 * common error. Non-opening-side moves unique to these lines are flagged
	 * `trap` so the trainer warns the user instead of calling them book.
	 */
	trapLines?: string[][];
	/**
	 * Hand-named lines the user can pick and drill in the trainer. Each is a full
	 * SAN line from move 1 (same shape as seedLines); it's seeded `forced` (or
	 * `trap` when marked) and its UCI path is emitted to the tree's `variations`
	 * so the setup picker and fork panel can offer it by name.
	 */
	namedLines?: { name: string; moves: string[]; trap?: boolean }[];
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
		maxDepthPlies: 24,
		minGames: 300,
		branchFraction: 0.05,
		topMovesPerNode: 4,
		maxRequests: 800
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
		maxDepthPlies: 24,
		minGames: 300,
		branchFraction: 0.05,
		topMovesPerNode: 4,
		maxRequests: 800
	},
	{
		id: 'wayward-queen',
		name: 'Wayward Queen Attack',
		side: 'white',
		description: '2.Qh5 and Scholar’s Mate tricks — deadly if unprepared, punishable if not.',
		seedLines: [
			// Scholar's mate threat and the clean refutation setup.
			['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'Nf6', 'g4', 'Nd4', 'Qd1']
		],
		trapLines: [
			// The punished defences — in the tree so the bot can exploit them.
			['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'],
			['e4', 'e5', 'Qh5', 'g6', 'Qxe5+', 'Ne7', 'Qxh8'],
			['e4', 'e5', 'Qh5', 'Nf6', 'Qxe5+', 'Qe7', 'Qxe7+', 'Bxe7']
		],
		// Named lines the trainer offers by name (pick one to drill). The refutation
		// is Black's; the trap lines let a White trainee practise punishing errors.
		namedLines: [
			{
				name: 'Clean refutation — …Nc6, …g6, chase to d4',
				moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'Nf6', 'g4', 'Nd4', 'Qd1']
			},
			{
				name: 'Trade queens — 4…Qf6',
				moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'Qf6']
			},
			{
				name: 'Punish 3…Nf6?? — Scholar’s mate',
				moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'],
				trap: true
			},
			{
				name: 'Punish 2…g6?? — Qxe5+ wins the rook',
				moves: ['e4', 'e5', 'Qh5', 'g6', 'Qxe5+', 'Ne7', 'Qxh8'],
				trap: true
			},
			{
				name: 'Punish 2…Nf6?? — Qxe5+ forks',
				moves: ['e4', 'e5', 'Qh5', 'Nf6', 'Qxe5+', 'Qe7', 'Qxe7+', 'Bxe7'],
				trap: true
			}
		],
		// Low bands: high-rated players never allow these lines, so the data lives here.
		ratings: [400, 1000, 1200],
		speeds: ['bullet', 'blitz', 'rapid'],
		maxDepthPlies: 18,
		minGames: 100,
		branchFraction: 0.04,
		topMovesPerNode: 4,
		maxRequests: 500
	},
	{
		id: 'fried-liver',
		name: 'Fried Liver Attack',
		side: 'white',
		description: 'Italian with Ng5 hunting f7 — sharp play for both sides of the Two Knights.',
		seedLines: [
			// The correct defence 5...Na5 — theory for both sides.
			['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5', 'Bb5+', 'c6', 'dxc6', 'bxc6', 'Be2', 'h6', 'Nf3', 'e4', 'Ne5']
		],
		trapLines: [
			// Main punishment line if Black grabs with 5...Nxd5.
			['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7', 'Kxf7', 'Qf3+', 'Ke6', 'Nc3']
		],
		ratings: [1000, 1200, 1400],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 22,
		minGames: 150,
		branchFraction: 0.04,
		topMovesPerNode: 4,
		maxRequests: 600
	},
	{
		id: 'italian',
		name: 'Italian Game',
		side: 'white',
		description: 'Quiet development, long-term pressure: Giuoco Piano and Pianissimo.',
		seedLines: [
			['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O', 'Re1', 'a6'],
			['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Bc5', 'c3', 'd6', 'O-O', 'O-O']
		],
		ratings: [1400, 1600, 1800],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 22,
		minGames: 300,
		branchFraction: 0.05,
		topMovesPerNode: 4,
		maxRequests: 700
	},
	{
		id: 'ruy-lopez',
		name: 'Ruy Lopez',
		side: 'white',
		description: 'The Spanish: 3.Bb5 — closed main lines and the Exchange variation.',
		seedLines: [
			['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O'],
			['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O', 'f6', 'd4', 'exd4', 'Nxd4']
		],
		ratings: [1400, 1600, 1800],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 22,
		minGames: 300,
		branchFraction: 0.05,
		topMovesPerNode: 4,
		maxRequests: 700
	},
	{
		id: 'sicilian',
		name: 'Sicilian Defence',
		side: 'black',
		description: 'Black’s sharpest reply to 1.e4 — Najdorf and Taimanov structures.',
		seedLines: [
			['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be2', 'e5', 'Nb3', 'Be7'],
			['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'Nc6', 'Nc3', 'Qc7'],
			['e4', 'c5', 'Nf3', 'Nc6', 'Bb5', 'g6', 'Bxc6', 'dxc6', 'd3', 'Bg7']
		],
		ratings: [1400, 1600, 1800],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 22,
		minGames: 300,
		branchFraction: 0.05,
		topMovesPerNode: 4,
		maxRequests: 700
	},
	{
		id: 'french',
		name: 'French Defence',
		side: 'black',
		description: 'Solid e6/d5 counterplay: Advance, Winawer and Tarrasch lines.',
		seedLines: [
			['e4', 'e6', 'd4', 'd5', 'e5', 'c5', 'c3', 'Nc6', 'Nf3', 'Qb6', 'a3', 'Nh6'],
			['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4', 'e5', 'c5', 'a3', 'Bxc3+', 'bxc3', 'Ne7'],
			['e4', 'e6', 'd4', 'd5', 'Nd2', 'c5', 'exd5', 'exd5', 'Ngf3', 'Nc6']
		],
		ratings: [1400, 1600, 1800],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 22,
		minGames: 300,
		branchFraction: 0.05,
		topMovesPerNode: 4,
		maxRequests: 700
	},
	{
		id: 'queens-gambit',
		name: 'Queen’s Gambit',
		side: 'white',
		description: '1.d4 d5 2.c4 — Declined, Slav and Accepted structures.',
		seedLines: [
			['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'h6', 'Bh4', 'b6'],
			['d4', 'd5', 'c4', 'dxc4', 'Nf3', 'Nf6', 'e3', 'e6', 'Bxc4', 'c5', 'O-O', 'a6'],
			['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'dxc4', 'a4', 'Bf5', 'e3', 'e6']
		],
		ratings: [1400, 1600, 1800],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 22,
		minGames: 300,
		branchFraction: 0.05,
		topMovesPerNode: 4,
		maxRequests: 700
	},
	{
		id: 'vienna',
		name: 'Vienna Game',
		side: 'white',
		description: '2.Nc3 keeping f4 in reserve — the Vienna Gambit and quiet lines.',
		seedLines: [
			['e4', 'e5', 'Nc3', 'Nf6', 'f4', 'd5', 'fxe5', 'Nxe4', 'Nf3', 'Be7', 'd4', 'O-O'],
			['e4', 'e5', 'Nc3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Bc5', 'f4', 'd6', 'Nf3']
		],
		trapLines: [
			// The punished gambit accept: 3...exf4? 4.e5 and the knight goes home.
			['e4', 'e5', 'Nc3', 'Nf6', 'f4', 'exf4', 'e5', 'Ng8', 'Nf3', 'd6', 'd4']
		],
		ratings: [1200, 1400, 1600],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 22,
		minGames: 250,
		branchFraction: 0.05,
		topMovesPerNode: 4,
		maxRequests: 700
	}
];
