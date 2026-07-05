/**
 * Shareable-URL codec: the full game state lives in the URL fragment, so links
 * work on a fully static host (nothing is sent to or stored on a server).
 *
 * Format: `#v1.<base64url(deflate-raw(JSON))>`. The version prefix lets the
 * format evolve without breaking old links.
 */

export interface ReviewShare {
	kind: 'review';
	/** Full game (headers + movetext); FEN starts round-trip via SetUp/FEN tags. */
	pgn: string;
	/** Plies shown on arrival (0 = start position). */
	ply?: number;
	/** Show the board from Black's side. */
	flip?: boolean;
}

export interface PracticeShare {
	kind: 'practice';
	/** Position to practice (side to move = the receiver's side). */
	fen: string;
	/** Human context, e.g. "Alice – Bob, move 15". */
	label?: string;
	/** Moves that led to `fen`, as PGN movetext, for the browsable prelude. */
	pgn?: string;
	/** Engine strength for the session. */
	elo?: number;
}

export type ShareState = ReviewShare | PracticeShare;

const VERSION = 'v1';

function toBase64Url(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
	const bin = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

async function pipe(
	bytes: Uint8Array<ArrayBuffer>,
	stream: CompressionStream | DecompressionStream
): Promise<Uint8Array> {
	const piped = new Blob([bytes]).stream().pipeThrough(stream);
	return new Uint8Array(await new Response(piped).arrayBuffer());
}

/** Encode state into a URL fragment (including the leading `#`). */
export async function encodeShare(state: ShareState): Promise<string> {
	const json = new TextEncoder().encode(JSON.stringify(state));
	const packed = await pipe(json, new CompressionStream('deflate-raw'));
	return `#${VERSION}.${toBase64Url(packed)}`;
}

/**
 * Decode a URL fragment (with or without the leading `#`) back into state.
 * Returns null for anything unrecognized or malformed — shared links come
 * from outside, so this must never throw.
 */
export async function decodeShare(fragment: string): Promise<ShareState | null> {
	const payload = fragment.replace(/^#/, '');
	if (!payload.startsWith(`${VERSION}.`)) return null;
	try {
		const packed = fromBase64Url(payload.slice(VERSION.length + 1));
		const json = await pipe(packed, new DecompressionStream('deflate-raw'));
		const state = JSON.parse(new TextDecoder().decode(json)) as ShareState;
		if (state.kind === 'review' && typeof state.pgn === 'string') return state;
		if (state.kind === 'practice' && typeof state.fen === 'string') return state;
		return null;
	} catch {
		return null;
	}
}
