<script lang="ts">
	import type { PlayedMove } from '$lib/game.svelte';
	import { BADGE_LABEL, type FeedbackItem } from './trainer.svelte';

	interface Props {
		history: PlayedMove[];
		feedbackByPly: Map<number, FeedbackItem>;
		/** Number of plies currently shown on the board (for highlight). */
		shownPly?: number;
		/** Jump the board view to the position after the clicked move. */
		onSelect?: (ply: number) => void;
		/** Who moved first / at what fullmove number (≠ defaults when starting from a FEN). */
		startColor?: 'white' | 'black';
		startNumber?: number;
	}

	let {
		history,
		feedbackByPly,
		shownPly = history.length,
		onSelect,
		startColor = 'white',
		startNumber = 1
	}: Props = $props();

	interface Row {
		num: number;
		white?: PlayedMove;
		wPly: number;
		black?: PlayedMove;
		bPly: number;
	}

	const rows = $derived.by(() => {
		const out: Row[] = [];
		let i = 0;
		let num = startNumber;
		if (startColor === 'black' && history.length > 0) {
			out.push({ num, white: undefined, wPly: -1, black: history[0], bPly: 0 });
			i = 1;
			num++;
		}
		for (; i < history.length; i += 2, num++) {
			out.push({ num, white: history[i], wPly: i, black: history[i + 1], bPly: i + 1 });
		}
		return out;
	});

	let list: HTMLElement | undefined = $state();

	$effect(() => {
		history.length;
		list?.scrollTo({ top: list.scrollHeight });
	});
</script>

{#snippet cell(move: PlayedMove | undefined, ply: number)}
	{#if move}
		{@const fb = feedbackByPly.get(ply)}
		<button class="san" class:current={shownPly === ply + 1} onclick={() => onSelect?.(ply + 1)}>
			{move.san}
			{#if fb}
				<span
					class="dot {fb.badge}"
					title="{BADGE_LABEL[fb.badge]}{fb.detail ? ` — ${fb.detail}` : ''}"
				></span>
			{/if}
		</button>
	{:else}
		<span class="san"></span>
	{/if}
{/snippet}

<ol class="moves" bind:this={list}>
	{#each rows as row (row.num)}
		<li>
			<span class="num">{row.num}.</span>
			{@render cell(row.white, row.wPly)}
			{@render cell(row.black, row.bPly)}
		</li>
	{/each}
</ol>

<style>
	.moves {
		margin: 0;
		padding: 0;
		list-style: none;
		max-height: 14rem;
		overflow-y: auto;
		font-size: 0.9rem;
	}

	.moves li {
		display: grid;
		grid-template-columns: 2rem 1fr 1fr;
		padding: 0.15rem 0.3rem;
	}

	.moves li:nth-child(odd) {
		background: rgba(255, 255, 255, 0.03);
	}

	.num {
		color: var(--text-dim);
	}

	.san {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	button.san {
		background: none;
		border: none;
		color: var(--text);
		font: inherit;
		padding: 0 0.25rem;
		border-radius: 4px;
		justify-content: flex-start;
	}

	button.san:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	button.san.current {
		background: color-mix(in srgb, var(--accent) 30%, transparent);
	}

	.dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.dot.book-best,
	.dot.best {
		background: var(--accent);
	}

	.dot.book {
		background: var(--q-book);
	}

	.dot.good {
		background: var(--q-good);
	}

	.dot.inaccuracy {
		background: var(--warn);
	}

	.dot.mistake {
		background: var(--q-mistake);
	}

	.dot.blunder,
	.dot.trap {
		background: var(--danger);
	}

	.dot.pending {
		background: var(--text-dim);
		opacity: 0.4;
	}
</style>
