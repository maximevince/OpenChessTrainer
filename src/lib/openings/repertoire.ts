/**
 * Parser for repertoire PGN files: standard PGN with recursive variations
 * `(...)`, comments `{...}` and NAGs, multiple games per file (one game =
 * one chapter, Lichess study export convention). chess.js cannot parse
 * variations, so this module tokenizes the movetext itself and validates
 * every SAN by replaying it through chess.js.
 *
 * Pure string-in / tree-out — no filesystem access — so the build scripts
 * and the unit tests share it.
 */
import { Chess } from 'chess.js';

export interface RepertoireNode {
	san: string;
	/** Canonical UCI (from+to+promotion), derived by replaying the SAN. */
	uci: string;
	/** Comment immediately after the move (becomes a trainer explanation). */
	comment?: string;
	/** Numeric NAGs ($1, $2…) plus those implied by !/?/!?/?! suffixes. */
	nags: number[];
	children: RepertoireNode[];
}

export interface RepertoireChapter {
	/** Chapter name: the part of the Event tag after "Study Name:", or the whole tag. */
	name: string;
	tags: Record<string, string>;
	/** Comment before the first move, if any (chapter introduction). */
	intro?: string;
	/** Candidate first moves (siblings at the start position). */
	moves: RepertoireNode[];
}

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);
const TAG_RE = /^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/;

/** SAN suffix annotations to NAG numbers (PGN standard 8.2.4 / 10). */
const SUFFIX_NAGS: Record<string, number> = {
	'!': 1,
	'?': 2,
	'!!': 3,
	'??': 4,
	'!?': 5,
	'?!': 6
};

interface Token {
	kind: 'san' | 'comment' | 'nag' | 'open' | 'close' | 'result';
	value: string;
	/** 1-based line in the source file, for error messages. */
	line: number;
}

class ParseError extends Error {
	constructor(message: string, line: number) {
		super(`PGN parse error at line ${line}: ${message}`);
	}
}

interface RawGame {
	tagLines: { line: string; n: number }[];
	movetext: { text: string; startLine: number };
}

/** Split a file into raw games: a tag section (possibly empty) plus movetext. */
function splitGames(text: string): RawGame[] {
	const lines = text.split(/\r?\n/);
	const games: RawGame[] = [];
	let current: RawGame | null = null;
	let inMovetext = false;
	let inComment = false; // a multi-line {...} — a '[' inside is not a tag
	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		const trimmed = raw.trim();
		if (!inComment && raw.startsWith('%')) continue; // PGN escape line
		if (!inComment && trimmed === '') continue;
		if (!inComment && TAG_RE.test(trimmed)) {
			if (inMovetext) {
				current = null; // a tag after movetext starts the next game
				inMovetext = false;
			}
			if (!current) {
				current = { tagLines: [], movetext: { text: '', startLine: i + 1 } };
				games.push(current);
			}
			current.tagLines.push({ line: trimmed, n: i + 1 });
			continue;
		}
		if (!current) {
			current = { tagLines: [], movetext: { text: '', startLine: i + 1 } };
			games.push(current);
		}
		if (!inMovetext) {
			inMovetext = true;
			current.movetext.startLine = i + 1;
		}
		current.movetext.text += raw + '\n';
		for (const ch of raw) {
			if (ch === '{') inComment = true;
			else if (ch === '}') inComment = false;
		}
	}
	return games.filter((g) => g.tagLines.length > 0 || g.movetext.text.trim() !== '');
}

function tokenizeMovetext(text: string, startLine: number): Token[] {
	const tokens: Token[] = [];
	let line = startLine;
	let i = 0;
	while (i < text.length) {
		const ch = text[i];
		if (ch === '\n') {
			line++;
			i++;
			continue;
		}
		if (/\s/.test(ch)) {
			i++;
			continue;
		}
		if (ch === '{') {
			const end = text.indexOf('}', i);
			if (end === -1) throw new ParseError('unterminated comment', line);
			const body = text.slice(i + 1, end);
			tokens.push({ kind: 'comment', value: body.replace(/\s+/g, ' ').trim(), line });
			line += (body.match(/\n/g) ?? []).length;
			i = end + 1;
			continue;
		}
		if (ch === ';') {
			// rest-of-line comment
			const end = text.indexOf('\n', i);
			i = end === -1 ? text.length : end;
			continue;
		}
		if (ch === '(') {
			tokens.push({ kind: 'open', value: '(', line });
			i++;
			continue;
		}
		if (ch === ')') {
			tokens.push({ kind: 'close', value: ')', line });
			i++;
			continue;
		}
		if (ch === '$') {
			const m = /^\$(\d+)/.exec(text.slice(i));
			if (!m) throw new ParseError('bad NAG', line);
			tokens.push({ kind: 'nag', value: m[1], line });
			i += m[0].length;
			continue;
		}
		// word token: move number, SAN, or result
		const m = /^[^\s(){};]+/.exec(text.slice(i));
		const word = m![0];
		i += word.length;
		if (RESULTS.has(word)) {
			tokens.push({ kind: 'result', value: word, line });
			continue;
		}
		// move numbers: "1." "1..." "12.…" — strip; bare "..." too
		if (/^\d+\.*$/.test(word) || /^\.+$/.test(word)) continue;
		tokens.push({ kind: 'san', value: word, line });
	}
	return tokens;
}

/**
 * Parse the moves of one variation into `siblings`. `chess` must be at the
 * position before the variation's first move and is left there on return.
 * Source order defines the mainline: `siblings[0]`/`children[0]` is the
 * recommended continuation.
 */
function parseVariation(
	tokens: Token[],
	pos: { i: number },
	chess: Chess,
	siblings: RepertoireNode[],
	attachIntro: (comment: string) => void
): void {
	// (node, fen before its move, its sibling array) — for spawning sub-variations
	let last: { node: RepertoireNode; fenBefore: string; siblings: RepertoireNode[] } | null = null;
	while (pos.i < tokens.length) {
		const t = tokens[pos.i];
		if (t.kind === 'close') return;
		pos.i++;
		switch (t.kind) {
			case 'result':
				return;
			case 'comment':
				if (last) {
					last.node.comment = last.node.comment ? `${last.node.comment} ${t.value}` : t.value;
				} else if (t.value) {
					attachIntro(t.value);
				}
				break;
			case 'nag':
				if (!last) throw new ParseError('NAG before any move', t.line);
				last.node.nags.push(Number(t.value));
				break;
			case 'open': {
				if (!last) throw new ParseError('variation before any move', t.line);
				// Alternative to the last move: parse from the position before it.
				const sub = new Chess(last.fenBefore);
				parseVariation(tokens, pos, sub, last.siblings, () => {});
				const close = tokens[pos.i];
				if (!close || close.kind !== 'close') {
					throw new ParseError('unterminated variation', t.line);
				}
				pos.i++;
				break;
			}
			case 'san': {
				// split "Nf3!?" into SAN + suffix NAG
				const m = /^(.*?)([!?]{1,2})?$/.exec(t.value)!;
				const san = m[1];
				const fenBefore = chess.fen();
				let move;
				try {
					move = chess.move(san);
				} catch {
					throw new ParseError(`illegal or unreadable move "${t.value}"`, t.line);
				}
				const uci = move.from + move.to + (move.promotion ?? '');
				let node = siblings.find((n) => n.uci === uci);
				if (!node) {
					node = { san: move.san, uci, nags: [], children: [] };
					siblings.push(node);
				}
				if (m[2]) {
					const nag = SUFFIX_NAGS[m[2]];
					if (nag && !node.nags.includes(nag)) node.nags.push(nag);
				}
				last = { node, fenBefore, siblings };
				siblings = node.children;
				break;
			}
		}
	}
}

/** Chapter name from the Event tag, honouring Lichess' "Study: Chapter" form. */
function chapterName(tags: Record<string, string>, index: number): string {
	const event = tags.Event;
	if (!event || event === '?') return `Chapter ${index + 1}`;
	const colon = event.indexOf(':');
	return colon === -1 ? event.trim() : event.slice(colon + 1).trim();
}

/**
 * Parse a repertoire PGN file into chapters. Throws with file line context on
 * malformed PGN or illegal moves — authoring bugs should fail the build.
 */
export function parseRepertoirePgn(text: string): RepertoireChapter[] {
	return splitGames(text).map((game, index) => {
		const tags: Record<string, string> = {};
		for (const { line, n } of game.tagLines) {
			const m = TAG_RE.exec(line);
			if (!m) throw new ParseError(`malformed tag pair: ${line}`, n);
			tags[m[1]] = m[2].replace(/\\(["\\])/g, '$1');
		}
		if (tags.FEN && tags.FEN !== new Chess().fen()) {
			throw new ParseError('repertoire chapters must start from the initial position', game.movetext.startLine);
		}
		const chapter: RepertoireChapter = {
			name: chapterName(tags, index),
			tags,
			moves: []
		};
		const tokens = tokenizeMovetext(game.movetext.text, game.movetext.startLine);
		const pos = { i: 0 };
		parseVariation(tokens, pos, new Chess(), chapter.moves, (c) => {
			chapter.intro = chapter.intro ? `${chapter.intro} ${c}` : c;
		});
		if (pos.i < tokens.length) {
			throw new ParseError(`unexpected "${tokens[pos.i].value}"`, tokens[pos.i].line);
		}
		if (chapter.moves.length === 0) {
			throw new ParseError(`chapter "${chapter.name}" has no moves`, game.movetext.startLine);
		}
		return chapter;
	});
}

/** The chapter's mainline as UCI + SAN, following the first child at each step. */
export function mainline(chapter: RepertoireChapter): { uci: string[]; san: string[] } {
	const uci: string[] = [];
	const san: string[] = [];
	for (let n: RepertoireNode | undefined = chapter.moves[0]; n; n = n.children[0]) {
		uci.push(n.uci);
		san.push(n.san);
	}
	return { uci, san };
}
