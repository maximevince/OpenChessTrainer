import { Chess, DEFAULT_POSITION, type Square } from 'chess.js';

export type Color = 'white' | 'black';

export interface PlayedMove {
	san: string;
	uci: string;
	/** FEN before the move was played */
	fenBefore: string;
	/** FEN after the move was played */
	fenAfter: string;
}

export interface GameResult {
	winner: Color | null;
	reason: string;
}

/** Color that played a given ply, given the color to move at the start position. */
export function colorOfPlyFrom(ply: number, startColor: Color): Color {
	const even = ply % 2 === 0;
	return even === (startColor === 'white') ? 'white' : 'black';
}

/** Fullmove number of a given ply, given the start color and fullmove number. */
export function moveNumberOfPlyFrom(ply: number, startColor: Color, startNumber: number): number {
	const offset = startColor === 'black' ? ply + 1 : ply;
	return startNumber + Math.floor(offset / 2);
}

/** Preformatted move-number label for a ply, e.g. "12." (white) or "12…" (black). */
export function plyLabel(ply: number, startColor: Color, startNumber: number): string {
	const num = moveNumberOfPlyFrom(ply, startColor, startNumber);
	return `${num}${colorOfPlyFrom(ply, startColor) === 'black' ? '…' : '.'}`;
}

/** Color to move in a FEN. */
export function turnOfFen(fen: string): Color {
	return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

/** Game result of a position, or null while the game is ongoing. */
export function resultOfPosition(pos: Chess): GameResult | null {
	if (pos.isCheckmate()) {
		return { winner: pos.turn() === 'w' ? 'black' : 'white', reason: 'checkmate' };
	}
	if (pos.isStalemate()) return { winner: null, reason: 'stalemate' };
	if (pos.isThreefoldRepetition()) return { winner: null, reason: 'repetition' };
	if (pos.isInsufficientMaterial()) return { winner: null, reason: 'insufficient material' };
	if (pos.isDraw()) return { winner: null, reason: 'draw' };
	return null;
}

/** Reactive wrapper around chess.js holding the single source of truth for the current game. */
export class Game {
	private chess = new Chess();

	fen = $state(this.chess.fen());
	history = $state<PlayedMove[]>([]);
	/** Side to move at the game's starting position (≠ white when practicing a FEN). */
	initialTurn = $state<Color>('white');
	/** Fullmove number at the starting position. */
	initialMoveNumber = $state(1);
	/** History length at reset: plies seeded as read-only context (can't be undone). */
	basePly = $state(0);

	turn = $derived<Color>(turnOfFen(this.fen));

	/** Shared read-only view of the current position; every position query reuses it. */
	private pos = $derived.by(() => new Chess(this.fen));

	/** Legal-move map in chessground format. */
	dests = $derived.by(() => {
		const map = new Map<Square, Square[]>();
		for (const m of this.pos.moves({ verbose: true })) {
			const arr = map.get(m.from);
			if (arr) arr.push(m.to);
			else map.set(m.from, [m.to]);
		}
		return map;
	});

	lastMove = $derived.by<[Square, Square] | undefined>(() => {
		const last = this.history.at(-1);
		if (!last) return undefined;
		return [last.uci.slice(0, 2) as Square, last.uci.slice(2, 4) as Square];
	});

	inCheck = $derived.by(() => this.pos.inCheck());

	isGameOver = $derived.by(() => this.pos.isGameOver());

	result = $derived.by<GameResult | null>(() => resultOfPosition(this.pos));

	/** UCI move list from the start position (used to follow opening books). */
	get uciMoves(): string[] {
		return this.history.map((m) => m.uci);
	}

	/**
	 * Play a move. Accepts `(from, to)` squares (auto-queen) or a single UCI string.
	 * Returns the played move or null if illegal.
	 */
	move(fromOrUci: string, to?: string): PlayedMove | null {
		const from = fromOrUci.slice(0, 2);
		const dest = to ?? fromOrUci.slice(2, 4);
		const promotion = (to ? 'q' : fromOrUci.slice(4, 5)) || 'q';
		const fenBefore = this.chess.fen();
		try {
			const m = this.chess.move({ from, to: dest, promotion });
			const played: PlayedMove = {
				san: m.san,
				uci: m.from + m.to + (m.promotion ?? ''),
				fenBefore,
				fenAfter: this.chess.fen()
			};
			this.history = [...this.history, played];
			this.fen = this.chess.fen();
			return played;
		} catch {
			return null;
		}
	}

	undo(plies = 1): void {
		let undone = 0;
		while (undone < plies && this.chess.undo()) undone++;
		if (undone > 0) {
			this.history = this.history.slice(0, this.history.length - undone);
			this.fen = this.chess.fen();
		}
	}

	/**
	 * Start over, optionally from an arbitrary FEN (throws on an invalid one).
	 * `prelude` seeds the history with the moves that led to `fen` (their last
	 * `fenAfter` must equal `fen`): they are browsable but not undoable, and
	 * move numbering starts from the prelude's first position.
	 */
	reset(fen: string = DEFAULT_POSITION, prelude: PlayedMove[] = []): void {
		this.chess = new Chess(fen);
		this.history = [...prelude];
		this.fen = this.chess.fen();
		this.basePly = prelude.length;
		const startFen = prelude[0]?.fenBefore ?? this.fen;
		const parts = startFen.split(' ');
		this.initialTurn = parts[1] === 'b' ? 'black' : 'white';
		this.initialMoveNumber = Number(parts[5]) || 1;
	}

	/** Which color played the given ply (parity shifts when starting from a FEN). */
	colorOfPly(ply: number): Color {
		return colorOfPlyFrom(ply, this.initialTurn);
	}

	/** Fullmove number of the given ply. */
	moveNumberOfPly(ply: number): number {
		return moveNumberOfPlyFrom(ply, this.initialTurn, this.initialMoveNumber);
	}

	/** Preformatted move-number label for a ply, e.g. "12." or "12…". */
	plyLabel(ply: number): string {
		return plyLabel(ply, this.initialTurn, this.initialMoveNumber);
	}
}
