/** Board badge (chessground label shape) per move verdict, chess.com style. */
export const VERDICT_GLYPH: Record<string, { text: string; fill: string }> = {
	inaccuracy: { text: '?!', fill: '#e8a33d' },
	mistake: { text: '?', fill: '#e07a3f' },
	blunder: { text: '??', fill: '#e2564b' },
	trap: { text: '??', fill: '#e2564b' }
};
