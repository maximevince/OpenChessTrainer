import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare, type PracticeShare, type ReviewShare } from './share';

const REVIEW: ReviewShare = {
	kind: 'review',
	pgn: '[White "Alice"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0',
	ply: 5,
	flip: true
};

const PRACTICE: PracticeShare = {
	kind: 'practice',
	fen: 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
	label: 'Alice - Bob, move 4',
	pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6',
	elo: 1800
};

describe('share codec', () => {
	it('round-trips a review share', async () => {
		expect(await decodeShare(await encodeShare(REVIEW))).toEqual(REVIEW);
	});

	it('round-trips a practice share', async () => {
		expect(await decodeShare(await encodeShare(PRACTICE))).toEqual(PRACTICE);
	});

	it('produces a URL-safe fragment', async () => {
		const fragment = await encodeShare(REVIEW);
		expect(fragment).toMatch(/^#v1\.[A-Za-z0-9_-]+$/);
	});

	it('accepts the fragment with or without the leading #', async () => {
		const fragment = await encodeShare(PRACTICE);
		expect(await decodeShare(fragment.slice(1))).toEqual(PRACTICE);
	});

	it('rejects garbage, wrong versions and truncated payloads', async () => {
		const fragment = await encodeShare(REVIEW);
		expect(await decodeShare('')).toBeNull();
		expect(await decodeShare('#not-a-share')).toBeNull();
		expect(await decodeShare(fragment.replace('v1.', 'v9.'))).toBeNull();
		expect(await decodeShare(fragment.slice(0, 12))).toBeNull();
		// Valid deflate+JSON but not a known shape.
		expect(await decodeShare(await encodeShare({ kind: 'review' } as ReviewShare))).toBeNull();
	});

	it('stays comfortably below common URL length limits for a long game', async () => {
		const movetext = Array.from({ length: 60 }, (_, i) => `${i + 1}. Nf3 Nf6 Ng1 Ng8`).join(' ');
		const fragment = await encodeShare({ kind: 'review', pgn: movetext });
		expect(fragment.length).toBeLessThan(2000);
	});
});
