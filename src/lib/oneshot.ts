/**
 * A one-slot cross-route hand-off channel: set a value before navigating,
 * read it on the other side. Plain module state, so it's lost on a hard
 * refresh — which is fine for these transient trainer↔review hand-offs.
 */
export interface OneShot<T> {
	set(value: T): void;
	/** Read without consuming. */
	peek(): T | null;
	/** Read and clear (single use). */
	take(): T | null;
	clear(): void;
}

export function oneShot<T>(): OneShot<T> {
	let current: T | null = null;
	return {
		set: (value) => void (current = value),
		peek: () => current,
		take: () => {
			const value = current;
			current = null;
			return value;
		},
		clear: () => void (current = null)
	};
}
