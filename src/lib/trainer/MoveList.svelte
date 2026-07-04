<script lang="ts">
	import type { PlayedMove } from '$lib/game.svelte';
	import type { FeedbackItem, FeedbackBadge } from './trainer.svelte';

	interface Props {
		history: PlayedMove[];
		feedbackByPly: Map<number, FeedbackItem>;
	}

	let { history, feedbackByPly }: Props = $props();

	const BADGE_TITLE: Record<FeedbackBadge, string> = {
		'book-best': 'Book · best',
		book: 'Book',
		best: 'Best',
		good: 'Good',
		inaccuracy: 'Inaccuracy',
		mistake: 'Mistake',
		blunder: 'Blunder',
		pending: 'Evaluating…'
	};

	const rows = $derived.by(() => {
		const out: { num: number; white?: PlayedMove; black?: PlayedMove; wPly: number }[] = [];
		for (let i = 0; i < history.length; i += 2) {
			out.push({ num: i / 2 + 1, white: history[i], black: history[i + 1], wPly: i });
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
		<span class="san">
			{move.san}
			{#if fb}
				<span
					class="dot {fb.badge}"
					title="{BADGE_TITLE[fb.badge]}{fb.detail ? ` — ${fb.detail}` : ''}"
				></span>
			{/if}
		</span>
	{:else}
		<span class="san"></span>
	{/if}
{/snippet}

<ol class="moves" bind:this={list}>
	{#each rows as row (row.num)}
		<li>
			<span class="num">{row.num}.</span>
			{@render cell(row.white, row.wPly)}
			{@render cell(row.black, row.wPly + 1)}
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
		background: #a1887f;
	}

	.dot.good {
		background: #4f7942;
	}

	.dot.inaccuracy {
		background: var(--warn);
	}

	.dot.mistake {
		background: #e07a3f;
	}

	.dot.blunder {
		background: var(--danger);
	}

	.dot.pending {
		background: var(--text-dim);
		opacity: 0.4;
	}
</style>
