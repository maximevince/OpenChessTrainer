import { describe, expect, it } from 'vitest';
import { mainline, parseRepertoirePgn } from './repertoire';

describe('parseRepertoirePgn', () => {
	it('parses a single mainline with tags', () => {
		const [ch] = parseRepertoirePgn(`[Event "Advance system"]
[Result "*"]

1. e4 c6 2. d4 d5 3. e5 Bf5 *
`);
		expect(ch.name).toBe('Advance system');
		expect(ch.tags.Result).toBe('*');
		expect(mainline(ch).san).toEqual(['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5']);
		expect(mainline(ch).uci).toEqual(['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4e5', 'c8f5']);
	});

	it('honours the Lichess "Study: Chapter" Event convention', () => {
		const [ch] = parseRepertoirePgn(`[Event "Caro-Kann repertoire: Advance system"]

1. e4 *`);
		expect(ch.name).toBe('Advance system');
	});

	it('parses variations as siblings, source order first = mainline', () => {
		const [ch] = parseRepertoirePgn(`[Event "test"]

1. e4 c6 2. d4 (2. Nc3 d5) 2... d5 *`);
		const e4 = ch.moves[0];
		const c6 = e4.children[0];
		expect(c6.children.map((n) => n.san)).toEqual(['d4', 'Nc3']);
		expect(c6.children[0].children[0].san).toBe('d5');
		expect(c6.children[1].children[0].san).toBe('d5');
	});

	it('parses nested variations', () => {
		const [ch] = parseRepertoirePgn(`[Event "test"]

1. e4 e5 (1... c6 2. d4 (2. Nc3) 2... d5) 2. Nf3 *`);
		const e4 = ch.moves[0];
		expect(e4.children.map((n) => n.san)).toEqual(['e5', 'c6']);
		const c6 = e4.children[1];
		expect(c6.children.map((n) => n.san)).toEqual(['d4', 'Nc3']);
		expect(e4.children[0].children[0].san).toBe('Nf3');
	});

	it('attaches comments to the preceding move and the intro to the chapter', () => {
		const [ch] = parseRepertoirePgn(`[Event "test"]

{ The Advance: space for White, targets for Black. }
1. e4 c6 { The Caro-Kann. } 2. d4 d5 *`);
		expect(ch.intro).toBe('The Advance: space for White, targets for Black.');
		expect(ch.moves[0].children[0].comment).toBe('The Caro-Kann.');
	});

	it('collects numeric NAGs and suffix annotations', () => {
		const [ch] = parseRepertoirePgn(`[Event "test"]

1. e4 c6 2. d4 $1 d5 3. f3!? dxe4?? *`);
		const c6 = ch.moves[0].children[0];
		const d4 = c6.children[0];
		expect(d4.nags).toEqual([1]);
		const f3 = d4.children[0].children[0];
		expect(f3.san).toBe('f3');
		expect(f3.nags).toEqual([5]);
		expect(f3.children[0].nags).toEqual([4]);
	});

	it('splits multiple games into chapters', () => {
		const chapters = parseRepertoirePgn(`[Event "rep: One"]

1. e4 c6 *

[Event "rep: Two"]

1. d4 d5 *`);
		expect(chapters.map((c) => c.name)).toEqual(['One', 'Two']);
		expect(chapters[1].moves[0].san).toBe('d4');
	});

	it('is not fooled by a bracket inside a multi-line comment', () => {
		const chapters = parseRepertoirePgn(`[Event "test"]

1. e4 { spans
[White "not a tag"]
lines } c6 *`);
		expect(chapters).toHaveLength(1);
		expect(chapters[0].moves[0].comment).toContain('[White "not a tag"]');
		expect(chapters[0].moves[0].children[0].san).toBe('c6');
	});

	it('merges a repeated move instead of duplicating the node', () => {
		const [ch] = parseRepertoirePgn(`[Event "test"]

1. e4 c6 (1... c5) 2. d4 (2. Nf3) *

[Event "test 2"]

1. e4 *`);
		expect(ch.moves).toHaveLength(1); // e4 once
		expect(ch.moves[0].children.map((n) => n.san)).toEqual(['c6', 'c5']);
	});

	it('throws with line context on an illegal move', () => {
		expect(() =>
			parseRepertoirePgn(`[Event "test"]

1. e4 c6
2. d4 Ke7 *`)
		).toThrow(/line 4.*Ke7/);
	});

	it('throws on an unterminated variation', () => {
		expect(() => parseRepertoirePgn(`[Event "t"]\n\n1. e4 (1. d4 *`)).toThrow(/unterminated|unexpected/);
	});

	it('rejects chapters that start from a custom FEN', () => {
		expect(() =>
			parseRepertoirePgn(`[Event "t"]
[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 2"]

1. e4 *`)
		).toThrow(/initial position/);
	});

	it('ignores escape lines and rest-of-line comments', () => {
		const [ch] = parseRepertoirePgn(`%ignore me
[Event "t"]

1. e4 ; king's pawn
1... c6 *`);
		expect(mainline(ch).san).toEqual(['e4', 'c6']);
	});
});
