/** Board badge (chessground label shape) per move verdict, chess.com style. */
export const VERDICT_GLYPH: Record<string, { text: string; fill: string }> = {
	great: { text: '!', fill: '#5b8bd0' },
	inaccuracy: { text: '?!', fill: '#e8a33d' },
	miss: { text: 'X', fill: '#f0644d' },
	mistake: { text: '?', fill: '#e07a3f' },
	blunder: { text: '??', fill: '#e2564b' },
	trap: { text: '??', fill: '#e2564b' }
};
