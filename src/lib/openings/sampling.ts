import type { BookNode } from './types';

/** Share of the most popular sibling below which a move is dropped (unless forced). */
const MIN_WEIGHT_SHARE = 0.01;

export const MIN_TEMPERATURE = 0.3;
export const MAX_TEMPERATURE = 1.5;

/** Map the UI variability slider [0,1] to a sampling temperature. 0 stays 0 (deterministic). */
export function temperatureFor(variability: number): number {
	if (variability <= 0) return 0;
	return MIN_TEMPERATURE + variability * (MAX_TEMPERATURE - MIN_TEMPERATURE);
}

/**
 * Pick a book move among children.
 * - temperature 0: most popular move (argmax weight).
 * - temperature t: p ∝ weight^(1/t) — higher t flattens the distribution.
 * Children below MIN_WEIGHT_SHARE of the most popular sibling are dropped unless forced.
 * RNG injectable for tests. Returns null when there are no candidates.
 */
export function pickMove(
	children: BookNode[],
	temperature: number,
	rng: () => number = Math.random
): BookNode | null {
	if (children.length === 0) return null;
	const maxWeight = Math.max(...children.map((c) => c.weight));
	const eligible = children.filter((c) => c.forced || c.weight >= maxWeight * MIN_WEIGHT_SHARE);
	if (eligible.length === 0) return null;

	if (temperature <= 0) {
		return eligible.reduce((best, c) => (c.weight > best.weight ? c : best));
	}

	// p ∝ w^(1/t), computed in log space for numeric stability with large game counts.
	const logits = eligible.map((c) => Math.log(Math.max(c.weight, 1)) / temperature);
	const maxLogit = Math.max(...logits);
	const expWeights = logits.map((l) => Math.exp(l - maxLogit));
	const total = expWeights.reduce((a, b) => a + b, 0);
	let roll = rng() * total;
	for (let i = 0; i < eligible.length; i++) {
		roll -= expWeights[i];
		if (roll <= 0) return eligible[i];
	}
	return eligible[eligible.length - 1];
}
