import type { OpeningSide, OpeningVariationKind } from '../src/lib/openings/types';

export interface OpeningSpec {
	id: string;
	name: string;
	/** The color that plays the opening. Trees are built symmetrically so the
	 * user can train either side ("learn to play" vs "learn to refute"). */
	side: OpeningSide;
	description: string;
	/**
	 * Curated repertoire PGN (path relative to the repo root): chapters with
	 * variations and comments define the opening side's moves. When set,
	 * `seedLines` is typically empty — the PGN is the skeleton — and the
	 * opening side gets NO explorer-picked alternatives (only a most-popular
	 * fallback where the PGN ends). Chapter mainlines are emitted as named
	 * variations for the picker.
	 */
	repertoirePgn?: string;
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
	 *
	 * `errBy` names the side whose first fresh move is the flagged error in a
	 * trap line; it defaults to the non-opening side, but an opening side can
	 * also punish itself (e.g. Greco's greedy …Qxe4 in Black's own opening).
	 */
	namedLines?: {
		name: string;
		moves: string[];
		trap?: boolean;
		errBy?: OpeningSide;
		/** The side whose moves along this line are endorsed (`recommended` in
		 * the built tree, first-listed line wins per position). For a refutation
		 * that's the refuting side, not `spec.side`. Traps never set it. */
		recommend?: OpeningSide;
		/** Cluster of related lines; becomes the picker optgroup. */
		group?: string;
		/** Semantic label; a trap line without one defaults to 'trap'. */
		kind?: OpeningVariationKind;
	}[];
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
		repertoirePgn: 'scripts/repertoires/london.pgn',
		seedLines: [],
		ratings: [1400, 1600, 1800],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 24,
		minGames: 300,
		branchFraction: 0.02,
		topMovesPerNode: 6,
		maxRequests: 2400
	},
	{
		id: 'caro-kann',
		name: 'Caro-Kann Defence',
		side: 'black',
		description:
			'Black meets 1.e4 with c6: Advance, Exchange, Classical, Fantasy, Panov and sidelines.',
		repertoirePgn: 'scripts/repertoires/caro-kann.pgn',
		seedLines: [],
		namedLines: [
			{
				name: '5.Qe2!? sidestep — answer with 5…Ndf6!',
				moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nd7', 'Qe2', 'Ndf6']
			},
			{
				name: 'Punish 5…Ngf6?? — 6.Nd6# smothered mate',
				moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nd7', 'Qe2', 'Ngf6', 'Nd6#'],
				trap: true,
				errBy: 'black'
			}
		],
		ratings: [1400, 1600, 1800],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 24,
		minGames: 300,
		// Wider opponent coverage than the seed-based books: the repertoire must
		// meet rare-but-real tries like the Fantasy (3.f3, ~5% of games).
		branchFraction: 0.02,
		topMovesPerNode: 6,
		// The wide repertoire tree needs a bigger budget than the seed books;
		// re-runs resume from the disk cache, so raising this only costs the
		// newly reached frontier.
		maxRequests: 2400
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
			['e4', 'e5', 'Qh5', 'Nf6', 'Qxe5+', 'Qe7', 'Qxe7+', 'Bxe7'],
			['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nd4', 'Qxf7#']
		],
		// Named lines the trainer offers by name (pick one to drill). The refutation
		// is Black's; the trap lines let a White trainee practise punishing errors.
		namedLines: [
			{
				name: 'Clean refutation — …Nc6, …g6, chase to d4',
				moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'Nf6', 'g4', 'Nd4', 'Qd1'],
				group: "Scholar's Mate",
				kind: 'refutation',
				recommend: 'black'
			},
			{
				name: 'Trade queens — 4…Qf6',
				moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'Qf6'],
				group: 'Early Queen Refutations',
				kind: 'refutation',
				recommend: 'black'
			},
			{
				name: 'Punish 3…Nf6?? — Scholar’s mate',
				moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'],
				trap: true,
				group: "Scholar's Mate"
			},
			{
				name: 'Punish 2…g6?? — Qxe5+ wins the rook',
				moves: ['e4', 'e5', 'Qh5', 'g6', 'Qxe5+', 'Ne7', 'Qxh8'],
				trap: true,
				group: 'Queen Raid Punishments'
			},
			{
				name: 'Punish 2…Nf6?? — Qxe5+ forks',
				moves: ['e4', 'e5', 'Qh5', 'Nf6', 'Qxe5+', 'Qe7', 'Qxe7+', 'Bxe7'],
				trap: true,
				group: 'Queen Raid Punishments'
			},
			{
				name: 'Punish 3…Nd4?? — Qxf7# anyway',
				moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nd4', 'Qxf7#'],
				trap: true,
				group: "Scholar's Mate"
			},
			{
				name: 'Kiddie Countergambit — 2…Nf6?! 3.Qxe5+ Be7, keep the pawn',
				moves: ['e4', 'e5', 'Qh5', 'Nf6', 'Qxe5+', 'Be7', 'Nf3', 'Nc6', 'Qf4'],
				group: 'Early Queen Refutations',
				kind: 'counterplay',
				recommend: 'black'
			},
			// Smirnov's "brutal" 4...f5 counter-gambit (engine-verified, only
			// +1.2 in the 6.Qd1 mainline - never word it as winning). The
			// mainline must stay listed before the traps so the trap flag lands
			// on the fresh queen move (6.Qd5/Qd3/Qe3), not shared 5.exf5.
			{
				name: 'Counter-gambit 4...f5 - main',
				moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'f5', 'exf5', 'Nd4', 'Qd1', 'd5', 'Bb3', 'Bxf5'],
				group: 'Punish with 4...f5',
				kind: 'mainline',
				recommend: 'black'
			},
			{
				name: 'Punish 5.Qxf5?? - gxf5 wins the queen',
				moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'f5', 'Qxf5', 'gxf5'],
				trap: true,
				errBy: 'white',
				group: 'Punish with 4...f5'
			},
			{
				name: 'Punish 6.Qd5 - queen trapped',
				moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'f5', 'exf5', 'Nd4', 'Qd5', 'Qf6', 'Bb3', 'Ne7', 'Qc4', 'd5', 'Qxc7', 'Nec6', 'Nf3', 'Bd6'],
				trap: true,
				errBy: 'white',
				group: 'Punish with 4...f5'
			},
			{
				name: 'Punish 6.Qd3 - mate with bxc2',
				moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'f5', 'exf5', 'Nd4', 'Qd3', 'd5', 'Bb3', 'Bxf5', 'Qc3', 'a5', 'Nf3', 'a4', 'Nxd4', 'exd4', 'Qxd4', 'Qe7+', 'Kd1', 'axb3', 'Qxh8', 'bxc2#'],
				trap: true,
				errBy: 'white',
				group: 'Punish with 4...f5'
			},
			{
				name: 'Punish 6.Qe3?? - Nxc2+ fork',
				moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'f5', 'exf5', 'Nd4', 'Qe3', 'Nxc2+'],
				trap: true,
				errBy: 'white',
				group: 'Punish with 4...f5'
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
		id: 'napoleon',
		name: 'Napoleon Attack',
		side: 'white',
		description: '2.Qf3 aiming at f7 — another premature queen raid, refuted by development.',
		seedLines: [
			// The main refutation skeleton: block with ...Nf6, hit the queen with ...Nd4.
			['e4', 'e5', 'Qf3', 'Nc6', 'Bc4', 'Nf6', 'Qb3', 'Nd4', 'Bxf7+', 'Ke7', 'Qc4', 'b5', 'Qc3', 'Kxf7']
		],
		trapLines: [
			// Punished defences: attacking the queen (or fianchettoing) while f7 hangs.
			['e4', 'e5', 'Qf3', 'Nc6', 'Bc4', 'Nd4', 'Qxf7#'],
			['e4', 'e5', 'Qf3', 'Nc6', 'Bc4', 'g6', 'Qxf7#']
		],
		namedLines: [
			{
				name: 'Clean refutation — block with …Nf6, hunt the queen',
				moves: ['e4', 'e5', 'Qf3', 'Nc6', 'Bc4', 'Nf6', 'Qb3', 'Nd4', 'Bxf7+', 'Ke7', 'Qc4', 'b5', 'Qc3', 'Kxf7'],
				group: 'Napoleon Refutation',
				kind: 'refutation',
				recommend: 'black'
			},
			{
				name: 'If White grabs b5?? — …Nxb5 wins the queen',
				moves: ['e4', 'e5', 'Qf3', 'Nc6', 'Bc4', 'Nf6', 'Qb3', 'Nd4', 'Bxf7+', 'Ke7', 'Qc4', 'b5', 'Qxb5', 'Nxb5'],
				group: 'Napoleon Refutation',
				kind: 'refutation',
				recommend: 'black'
			},
			{
				name: 'Punish 3…Nd4?? — Qxf7# anyway',
				moves: ['e4', 'e5', 'Qf3', 'Nc6', 'Bc4', 'Nd4', 'Qxf7#'],
				trap: true,
				group: 'f7 Punishments'
			},
			{
				name: 'Punish 3…g6?? — Qxf7#',
				moves: ['e4', 'e5', 'Qf3', 'Nc6', 'Bc4', 'g6', 'Qxf7#'],
				trap: true,
				group: 'f7 Punishments'
			}
		],
		// Like the Wayward Queen: only low bands ever see these positions.
		ratings: [400, 1000, 1200],
		speeds: ['bullet', 'blitz', 'rapid'],
		maxDepthPlies: 18,
		minGames: 100,
		branchFraction: 0.04,
		topMovesPerNode: 4,
		maxRequests: 500
	},
	{
		// Scholar's Mate via 2.Bc4 first (Bishop's Opening move order) — the
		// gap the classic 2.Qh5 book can't cover: the ...f5! Rousseau-style
		// counter and the Pirc anti-prep trap (GM Smirnov's lines, engine-
		// verified). Both entry moves live in one tree (root = start pos).
		id: 'bishop-scholar',
		name: "Scholar's Mate: Bishop's Opening order",
		side: 'white',
		description: '2.Bc4 then 3.Qf3 hunting f7 - punished by 3...f5! or the Pirc anti-prep.',
		seedLines: [
			// White's only equalizer after 3...f5!.
			['e4', 'e5', 'Bc4', 'Nc6', 'Qf3', 'f5', 'Ne2'],
			// The sound 4.exf5 branch: 4...Nf6! keeps Black comfortable.
			['e4', 'e5', 'Bc4', 'Nc6', 'Qf3', 'f5', 'exf5', 'Nf6', 'Ne2'],
			// 4.Bxg8 Nd4! zwischenzug and White's best escape 5.Qh3.
			['e4', 'e5', 'Bc4', 'Nc6', 'Qf3', 'f5', 'Bxg8', 'Nd4', 'Qh3', 'Rxg8'],
			// Pirc anti-prep: White holds with 5.Qe2.
			['e4', 'd6', 'Bc4', 'g6', 'Qf3', 'Nf6', 'd4', 'Bg7', 'Qe2']
		],
		namedLines: [
			// Sound spines first so the trap flags land on the fresh erring move
			// (4.Qxf5/5.g4/5.e5...), never on a shared prefix.
			{
				name: 'Counter 3...f5 - White must play 4.Ne2',
				moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qf3', 'f5', 'Ne2'],
				group: 'Rousseau Counter 3...f5',
				kind: 'mainline',
				recommend: 'black'
			},
			{
				name: 'Punish 4.Qxf5? - d5 and Bxf5',
				moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qf3', 'f5', 'Qxf5', 'd5', 'Bxd5', 'Bxf5'],
				trap: true,
				errBy: 'white',
				group: 'Rousseau Counter 3...f5'
			},
			{
				name: 'Queen hunt - 4.Qxf5? d5 5.Qh5+',
				moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qf3', 'f5', 'Qxf5', 'd5', 'Qh5+', 'g6', 'Qe2', 'Nd4', 'Qd3', 'dxc4', 'Qxc4', 'Be6', 'Qa4+', 'b5', 'Qa6', 'Bc8', 'Qa5', 'Bb4', 'Qxb4', 'Nxc2+', 'Kd1', 'Nxb4'],
				trap: true,
				errBy: 'white',
				group: 'Rousseau Counter 3...f5'
			},
			{
				name: 'Punish 5.g4? - Nxg4!! and Qf2#',
				moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qf3', 'f5', 'exf5', 'Nf6', 'g4', 'Nd4', 'Qd1', 'b5', 'Bb3', 'Bb7', 'f3', 'Nxg4', 'fxg4', 'Qh4+', 'Kf1', 'Bc5', 'd3', 'Nxb3', 'axb3', 'Qf2#'],
				trap: true,
				errBy: 'white',
				group: 'Rousseau Counter 3...f5'
			},
			{
				name: '4.Bxg8 - punish 5.Qe3??',
				moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qf3', 'f5', 'Bxg8', 'Nd4', 'Qe3', 'Nxc2+'],
				trap: true,
				errBy: 'white',
				group: 'Rousseau Counter 3...f5'
			},
			{
				name: '4.Bxg8 - punish 5.Qd3',
				moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qf3', 'f5', 'Bxg8', 'Nd4', 'Qd3', 'Rxg8', 'exf5', 'd5', 'c3', 'Bxf5'],
				trap: true,
				errBy: 'white',
				group: 'Rousseau Counter 3...f5'
			},
			{
				// GOTCHA: vs 5.Qd1 the retreat is 7...Nc6! — 7...Bxf5?? loses a
				// piece to 8.cxd4. The Bxf5 trick only works when the queen
				// sits on d3 (previous line). Guarded by named-lines.test.ts.
				name: '4.Bxg8 5.Qd1 - retreat Nc6!',
				moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qf3', 'f5', 'Bxg8', 'Nd4', 'Qd1', 'Rxg8', 'exf5', 'd5', 'c3', 'Nc6'],
				group: 'Rousseau Counter 3...f5',
				kind: 'counterplay',
				recommend: 'black'
			},
			{
				name: 'White holds with 5.Qe2',
				moves: ['e4', 'd6', 'Bc4', 'g6', 'Qf3', 'Nf6', 'd4', 'Bg7', 'Qe2'],
				group: 'Pirc anti-prep',
				kind: 'mainline',
				recommend: 'black'
			},
			{
				name: 'Punish 5.e5? - Qd1# after Qf4',
				moves: ['e4', 'd6', 'Bc4', 'g6', 'Qf3', 'Nf6', 'd4', 'Bg7', 'e5', 'dxe5', 'dxe5', 'Bg4', 'Qf4', 'Qd1#'],
				trap: true,
				errBy: 'white',
				group: 'Pirc anti-prep'
			},
			{
				// GOTCHA: 7...Bxf3 MUST come before the mate — immediate
				// 7...Qd1+?? loses to 8.Qxd1 from f3. Guarded by named-lines.test.ts.
				name: 'Punish 5.e5? - Bxf3 first, then Qd1#',
				moves: ['e4', 'd6', 'Bc4', 'g6', 'Qf3', 'Nf6', 'd4', 'Bg7', 'e5', 'dxe5', 'dxe5', 'Bg4', 'exf6', 'Bxf3', 'fxg7', 'Qd1#'],
				trap: true,
				errBy: 'white',
				group: 'Pirc anti-prep'
			},
			{
				name: '5.e5? escape - 7.Qd3 queen trade',
				moves: ['e4', 'd6', 'Bc4', 'g6', 'Qf3', 'Nf6', 'd4', 'Bg7', 'e5', 'dxe5', 'dxe5', 'Bg4', 'Qd3', 'Qxd3', 'Bxd3', 'Nd5'],
				group: 'Pirc anti-prep',
				kind: 'counterplay',
				recommend: 'black'
			}
		],
		// Low bands, same as the other queen-raid books: only beginners reach these.
		ratings: [400, 1000, 1200],
		speeds: ['bullet', 'blitz', 'rapid'],
		maxDepthPlies: 18,
		minGames: 100,
		branchFraction: 0.04,
		topMovesPerNode: 4,
		maxRequests: 500
	},
	{
		id: 'greco-defense',
		name: 'Greco Defence (early …Qf6)',
		side: 'black',
		description: 'Black’s 2…Qf6 mirror of the scholar’s-mate idea — meet it with tempo.',
		seedLines: [
			// White's clean refutation: develop with tempo, Nd5, grab the centre.
			['e4', 'e5', 'Nf3', 'Qf6', 'Nc3', 'Bc5', 'Nd5', 'Qd8', 'c3', 'd6', 'd4'],
			// Keep the dubious-but-common ...Qg6 unflagged; the flagged error in the
			// named trap lines below is the queen grab that follows it.
			['e4', 'e5', 'Nf3', 'Qf6', 'Bc4', 'Qg6', 'O-O'],
			['e4', 'e5', 'Nf3', 'Qf6', 'Nc3', 'Qg6', 'd4', 'exd4', 'Nd5']
		],
		trapLines: [
			// The point of 2...Qf6: e5 is poisoned.
			['e4', 'e5', 'Nf3', 'Qf6', 'Nxe5', 'Qxe5']
		],
		namedLines: [
			{
				name: 'Clean refutation — 3.Nc3 and Nd5 with tempo',
				moves: ['e4', 'e5', 'Nf3', 'Qf6', 'Nc3', 'Bc5', 'Nd5', 'Qd8', 'c3', 'd6', 'd4'],
				group: 'Early ...Qf6',
				kind: 'refutation',
				recommend: 'white'
			},
			{
				name: 'Punish 3.Nxe5?? — the point of …Qf6',
				moves: ['e4', 'e5', 'Nf3', 'Qf6', 'Nxe5', 'Qxe5'],
				trap: true,
				group: 'Early ...Qf6'
			},
			{
				name: 'Punish greedy …Qxe4?? — Bxf7+ and Ng5+ fork',
				moves: ['e4', 'e5', 'Nf3', 'Qf6', 'Bc4', 'Qg6', 'O-O', 'Qxe4', 'Bxf7+', 'Kxf7', 'Ng5+', 'Ke8', 'Nxe4'],
				trap: true,
				errBy: 'black',
				group: 'Early ...Qf6'
			},
			{
				name: 'Punish …Qxe4+?? vs 3.Nc3 — Nxe4 wins the queen',
				moves: ['e4', 'e5', 'Nf3', 'Qf6', 'Nc3', 'Qg6', 'd4', 'Qxe4+', 'Nxe4'],
				trap: true,
				errBy: 'black',
				group: 'Early ...Qf6'
			}
		],
		ratings: [400, 1000, 1200],
		speeds: ['bullet', 'blitz', 'rapid'],
		maxDepthPlies: 18,
		minGames: 100,
		branchFraction: 0.04,
		topMovesPerNode: 4,
		maxRequests: 500
	},
	{
		id: 'englund',
		name: 'Englund Gambit',
		side: 'black',
		description: '1.d4 e5!? — Black’s trap-laden gambit; sound play refutes it, greed gets mated.',
		seedLines: [
			// Main line with White's correct refutation of the b2 raid: 6.Nc3! and Rb1.
			['d4', 'e5', 'dxe5', 'Nc6', 'Nf3', 'Qe7', 'Bf4', 'Qb4+', 'Bd2', 'Qxb2', 'Nc3', 'Bb4', 'Rb1', 'Qa3', 'Rb3', 'Qa5', 'e4', 'Nge7']
		],
		trapLines: [
			// The classic: 6.Bc3?? walks into ...Bb4! and ...Qc1# (Nb1 blocks the rook).
			['d4', 'e5', 'dxe5', 'Nc6', 'Nf3', 'Qe7', 'Bf4', 'Qb4+', 'Bd2', 'Qxb2', 'Bc3', 'Bb4', 'Qd2', 'Bxc3', 'Qxc3', 'Qc1#']
		],
		namedLines: [
			{
				name: 'Main line — 3…Qe7 and the b2 raid, refuted by 6.Nc3!',
				moves: ['d4', 'e5', 'dxe5', 'Nc6', 'Nf3', 'Qe7', 'Bf4', 'Qb4+', 'Bd2', 'Qxb2', 'Nc3', 'Bb4', 'Rb1', 'Qa3', 'Rb3', 'Qa5', 'e4', 'Nge7']
			},
			{
				name: 'Punish 6.Bc3?? — …Bb4! and Qc1# (the classic trap)',
				moves: ['d4', 'e5', 'dxe5', 'Nc6', 'Nf3', 'Qe7', 'Bf4', 'Qb4+', 'Bd2', 'Qxb2', 'Bc3', 'Bb4', 'Qd2', 'Bxc3', 'Qxc3', 'Qc1#'],
				trap: true
			},
			{
				name: 'Mosquito Gambit — punish 2…Qh4?! with 3.Nf3!',
				moves: ['d4', 'e5', 'dxe5', 'Qh4', 'Nf3', 'Qh5', 'Nc3'],
				trap: true,
				errBy: 'black'
			},
			{
				name: 'Soller Gambit — punish 2…f6?! (just take)',
				moves: ['d4', 'e5', 'dxe5', 'f6', 'exf6', 'Nxf6', 'Nf3'],
				trap: true,
				errBy: 'black'
			}
		],
		// Englund tricks live in fast low-to-club games.
		ratings: [1000, 1200, 1400],
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
		namedLines: [
			{
				name: 'Main defence - 5...Na5',
				moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5', 'Bb5+', 'c6', 'dxc6', 'bxc6', 'Be2', 'h6', 'Nf3', 'e4', 'Ne5'],
				group: 'Fried Liver',
				kind: 'mainline',
				recommend: 'white'
			},
			{
				name: 'Punish 5...Nxd5?!',
				moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7', 'Kxf7', 'Qf3+', 'Ke6', 'Nc3'],
				trap: true,
				group: 'Fried Liver'
			},
			{
				name: 'Traxler - sound 5.Bxf7+',
				moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'Bc5', 'Bxf7+', 'Ke7', 'Bd5', 'Rf8', 'O-O', 'd6', 'c3'],
				group: 'Two Knights Counterplay',
				kind: 'refutation',
				recommend: 'white'
			},
			{
				// White's greedy 5.Nxf7? is the flagged error: after ...Bxf2+! Black
				// gets a huge attack. In the book so trainees see WHY to prefer Bxf7+.
				name: 'Traxler danger - 5.Nxf7? Bxf2+!',
				moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'Bc5', 'Nxf7', 'Bxf2+', 'Kxf2', 'Nxe4+', 'Kg1'],
				trap: true,
				errBy: 'white',
				group: 'Two Knights Counterplay',
				kind: 'counterplay'
			},
			{
				name: 'Ulvestad - 5...b5',
				moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'b5', 'Bf1', 'Nxd5'],
				group: 'Two Knights Counterplay',
				kind: 'counterplay'
			},
			{
				name: 'Fritz - 5...Nd4',
				moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nd4', 'c3', 'b5', 'Bf1', 'Nxd5'],
				group: 'Two Knights Counterplay',
				kind: 'counterplay'
			}
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
		repertoirePgn: 'scripts/repertoires/italian.pgn',
		seedLines: [
			// Blackburne Shilling (Blackburne-Kostić) declined the right way: 4.Nxd4!
			['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4', 'Nxd4', 'exd4', 'O-O'],
			// Légal prefix: sound play by both sides up to Black's slow ...g6?.
			['e4', 'e5', 'Nf3', 'd6', 'Bc4', 'Bg4', 'Nc3']
		],
		trapLines: [
			// Légal Trap: ...g6? allows Nxe5!, and greedy ...Bxd1?? gets mated.
			['e4', 'e5', 'Nf3', 'd6', 'Bc4', 'Bg4', 'Nc3', 'g6', 'Nxe5', 'Bxd1', 'Bxf7+', 'Ke7', 'Nd5#']
		],
		namedLines: [
			{
				name: 'Blackburne Shilling Gambit — decline with 4.Nxd4!',
				moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4', 'Nxd4', 'exd4', 'O-O']
			},
			{
				name: 'Blackburne Shilling — punish 4.Nxe5?? (…Qg5! and Nf3#)',
				moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4', 'Nxe5', 'Qg5', 'Nxf7', 'Qxg2', 'Rf1', 'Qxe4+', 'Be2', 'Nf3#'],
				trap: true,
				errBy: 'white'
			},
			{
				name: 'Légal Trap — punish greedy …Bxd1?? with Nd5#',
				moves: ['e4', 'e5', 'Nf3', 'd6', 'Bc4', 'Bg4', 'Nc3', 'g6', 'Nxe5', 'Bxd1', 'Bxf7+', 'Ke7', 'Nd5#'],
				trap: true
			}
		],
		ratings: [1400, 1600, 1800],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 24,
		minGames: 300,
		branchFraction: 0.02,
		topMovesPerNode: 6,
		maxRequests: 2400
	},
	{
		id: 'ruy-lopez',
		name: 'Ruy Lopez',
		side: 'white',
		description: 'The Spanish: 3.Bb5 — closed main lines and the Exchange variation.',
		repertoirePgn: 'scripts/repertoires/ruy-lopez.pgn',
		seedLines: [
			// Noah's Ark prefix with White's correct escape: 10.c3! (never Qxd4??).
			['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'd4', 'Nxd4', 'Nxd4', 'exd4', 'c3'],
			// Fishing Pole prefix: meet ...Ng4 with h3 and calmly decline the bait.
			['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'O-O', 'Ng4', 'h3', 'h5', 'c3']
		],
		namedLines: [
			{
				name: 'Noah’s Ark Trap — punish 10.Qxd4?? (…c5 and …c4 snare Bb3)',
				moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'd4', 'Nxd4', 'Nxd4', 'exd4', 'Qxd4', 'c5', 'Qd5', 'Be6', 'Qc6+', 'Bd7', 'Qd5', 'c4'],
				trap: true,
				errBy: 'white'
			},
			{
				name: 'Mortimer Trap — punish 5.Nxe5?? (…c6! and …Qa5+)',
				moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'd3', 'Ne7', 'Nxe5', 'c6', 'Ba4', 'Qa5+', 'Nc3', 'Qxe5'],
				trap: true,
				errBy: 'white'
			},
			{
				name: 'Fishing Pole — punish 6.hxg4?? (h-file mate attack)',
				moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'O-O', 'Ng4', 'h3', 'h5', 'hxg4', 'hxg4', 'Ne1', 'Qh4', 'f3', 'g3'],
				trap: true,
				errBy: 'white'
			}
		],
		ratings: [1400, 1600, 1800],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 24,
		minGames: 300,
		branchFraction: 0.02,
		topMovesPerNode: 6,
		maxRequests: 2400
	},
	{
		id: 'sicilian',
		name: 'Sicilian Defence',
		side: 'black',
		description: 'Black’s sharpest reply to 1.e4 — Najdorf plus anti-Sicilian answers.',
		repertoirePgn: 'scripts/repertoires/sicilian.pgn',
		seedLines: [],
		trapLines: [
			// Siberian Trap: 9.h3?? Nd4! and the queen mates on h2.
			['e4', 'c5', 'd4', 'cxd4', 'c3', 'dxc3', 'Nxc3', 'Nc6', 'Nf3', 'e6', 'Bc4', 'Qc7', 'Qe2', 'Nf6', 'O-O', 'Ng4', 'h3', 'Nd4', 'Nxd4', 'Qh2#']
		],
		namedLines: [
			{
				name: 'Smith-Morra, Siberian Variation — 9.g3! declines the trap',
				moves: ['e4', 'c5', 'd4', 'cxd4', 'c3', 'dxc3', 'Nxc3', 'Nc6', 'Nf3', 'e6', 'Bc4', 'Qc7', 'Qe2', 'Nf6', 'O-O', 'Ng4', 'g3']
			},
			{
				name: 'Siberian Trap — punish 9.h3?? with …Nd4! and Qh2#',
				moves: ['e4', 'c5', 'd4', 'cxd4', 'c3', 'dxc3', 'Nxc3', 'Nc6', 'Nf3', 'e6', 'Bc4', 'Qc7', 'Qe2', 'Nf6', 'O-O', 'Ng4', 'h3', 'Nd4', 'Nxd4', 'Qh2#'],
				trap: true
			},
			{
				name: 'Anti-Sozin — 6…e6! avoids the Magnus Smith trap',
				moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'd6', 'Bc4', 'e6']
			},
			{
				name: 'Magnus Smith Trap — punish 6…g6?! (7.Nxc6 and 8.e5!)',
				moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'd6', 'Bc4', 'g6', 'Nxc6', 'bxc6', 'e5', 'dxe5', 'Bxf7+', 'Kxf7', 'Qxd8'],
				trap: true,
				errBy: 'black'
			}
		],
		ratings: [1400, 1600, 1800],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 24,
		minGames: 300,
		branchFraction: 0.02,
		topMovesPerNode: 6,
		maxRequests: 2400
	},
	{
		id: 'french',
		name: 'French Defence',
		side: 'black',
		description: 'Solid e6/d5 counterplay: Advance, Winawer, Tarrasch, Exchange and KIA.',
		repertoirePgn: 'scripts/repertoires/french.pgn',
		seedLines: [],
		ratings: [1400, 1600, 1800],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 24,
		minGames: 300,
		branchFraction: 0.02,
		topMovesPerNode: 6,
		maxRequests: 2400
	},
	{
		id: 'queens-gambit',
		name: 'Queen’s Gambit',
		side: 'white',
		description: '1.d4 d5 2.c4 — Declined, Slav and Accepted structures.',
		repertoirePgn: 'scripts/repertoires/queens-gambit.pgn',
		seedLines: [
			// Elephant Trap prefix: after 4...Nbd7 the d5 pawn is poisoned — play 6.e3.
			['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Nbd7', 'cxd5', 'exd5', 'e3'],
			// Rubinstein Trap prefix: orthodox QGD theory up to 12.Bf4 — then ...f5? loses.
			['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'Nbd7', 'Rc1', 'Re8', 'Qc2', 'a6', 'cxd5', 'exd5', 'Bd3', 'c6', 'O-O', 'Ne4', 'Bf4']
		],
		trapLines: [
			// Rubinstein Trap: 12...f5? 13.Nxd5! cxd5?? 14.Bc7 wins the queen.
			['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'Nbd7', 'Rc1', 'Re8', 'Qc2', 'a6', 'cxd5', 'exd5', 'Bd3', 'c6', 'O-O', 'Ne4', 'Bf4', 'f5', 'Nxd5', 'cxd5', 'Bc7']
		],
		namedLines: [
			{
				name: 'Elephant Trap — punish 6.Nxd5?? (…Nxd5! 7.Bxd8 Bb4+!)',
				moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Nbd7', 'cxd5', 'exd5', 'Nxd5', 'Nxd5', 'Bxd8', 'Bb4+', 'Qd2', 'Bxd2+', 'Kxd2', 'Kxd8'],
				trap: true,
				errBy: 'white'
			},
			{
				name: 'Cambridge Springs Defence — main line with 7.Nd2!',
				moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Nbd7', 'e3', 'c6', 'Nf3', 'Qa5', 'Nd2', 'Bb4', 'Qc2', 'O-O']
			},
			{
				name: 'Cambridge Springs trap — punish 7.Bd3?? (…dxc4 and …Ne4!)',
				moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Nbd7', 'e3', 'c6', 'Nf3', 'Qa5', 'Bd3', 'dxc4', 'Bxc4', 'Ne4', 'Bf4', 'Nxc3', 'bxc3', 'Qxc3+', 'Nd2', 'Qxc4'],
				trap: true,
				errBy: 'white'
			},
			{
				name: 'Rubinstein Trap — punish 12…f5? (13.Nxd5! and 14.Bc7)',
				moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'Nbd7', 'Rc1', 'Re8', 'Qc2', 'a6', 'cxd5', 'exd5', 'Bd3', 'c6', 'O-O', 'Ne4', 'Bf4', 'f5', 'Nxd5', 'cxd5', 'Bc7'],
				trap: true
			}
		],
		ratings: [1400, 1600, 1800],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 24,
		minGames: 300,
		branchFraction: 0.02,
		topMovesPerNode: 6,
		maxRequests: 2400
	},
	{
		id: 'vienna',
		name: 'Vienna Game',
		side: 'white',
		description: '2.Nc3 keeping f4 in reserve — the Vienna Gambit and quiet lines.',
		repertoirePgn: 'scripts/repertoires/vienna.pgn',
		seedLines: [],
		trapLines: [
			// The punished gambit accept: 3...exf4? 4.e5 and the knight goes home.
			['e4', 'e5', 'Nc3', 'Nf6', 'f4', 'exf4', 'e5', 'Ng8', 'Nf3', 'd6', 'd4'],
			// Würzburger Trap: the greedy 5...Qh4+?! raid ends a rook down.
			['e4', 'e5', 'Nc3', 'Nf6', 'f4', 'd5', 'fxe5', 'Nxe4', 'd3', 'Qh4+', 'g3', 'Nxg3', 'Nf3', 'Qh5', 'Nxd5', 'Nxh1', 'Nxc7+', 'Kd8', 'Nxa8']
		],
		namedLines: [
			{
				name: 'Vienna Gambit main line — 3…d5!',
				moves: ['e4', 'e5', 'Nc3', 'Nf6', 'f4', 'd5', 'fxe5', 'Nxe4', 'Nf3', 'Be7', 'd4', 'O-O']
			},
			{
				name: 'Würzburger Trap — punish 5…Qh4+?! (6.g3! Nxg3 7.Nf3)',
				moves: ['e4', 'e5', 'Nc3', 'Nf6', 'f4', 'd5', 'fxe5', 'Nxe4', 'd3', 'Qh4+', 'g3', 'Nxg3', 'Nf3', 'Qh5', 'Nxd5', 'Nxh1', 'Nxc7+', 'Kd8', 'Nxa8'],
				trap: true
			},
			{
				name: 'Punish 3…exf4?! — 4.e5! sends the knight home',
				moves: ['e4', 'e5', 'Nc3', 'Nf6', 'f4', 'exf4', 'e5', 'Ng8', 'Nf3', 'd6', 'd4'],
				trap: true
			}
		],
		ratings: [1200, 1400, 1600],
		speeds: ['blitz', 'rapid'],
		maxDepthPlies: 24,
		minGames: 250,
		branchFraction: 0.02,
		topMovesPerNode: 6,
		maxRequests: 2400
	}
];
