<script lang="ts">
	import type { Trainer, FeedbackBadge } from './trainer.svelte';

	let { trainer }: { trainer: Trainer } = $props();

	const BADGE_LABEL: Record<FeedbackBadge, string> = {
		'book-best': 'Book · best',
		book: 'Book',
		best: 'Best',
		good: 'Good',
		inaccuracy: 'Inaccuracy',
		mistake: 'Mistake',
		blunder: 'Blunder',
		pending: '…'
	};

	const last = $derived(trainer.lastFeedback);
</script>

<div class="feedback">
	<div class="actions">
		<button
			class="btn btn-secondary"
			onclick={() => trainer.showHint()}
			disabled={trainer.phase !== 'userTurn' || trainer.hintLoading}
		>
			{trainer.hintLoading ? 'Hint…' : 'Hint'}
		</button>
		{#if trainer.canRetry}
			<button class="btn retry" onclick={() => trainer.undoRetry()}>Undo & retry</button>
		{/if}
	</div>

	{#if trainer.hint}
		<p class="hint-note {trainer.hint.source}">
			{trainer.hint.source === 'book' ? 'Book suggests the green arrow.' : 'Engine suggests the blue arrow.'}
		</p>
	{/if}

	{#if last}
		<div class="callout">
			<span class="move">{last.moveNumber}.{last.ply % 2 === 1 ? '..' : ''} {last.san}</span>
			<span class="badge {last.badge}">{BADGE_LABEL[last.badge]}</span>
			{#if last.detail}<span class="detail">{last.detail}</span>{/if}
		</div>
	{/if}
</div>

<style>
	.feedback {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.actions .btn {
		flex: 1;
	}

	.retry {
		background: var(--warn);
		color: #222;
	}

	.hint-note {
		margin: 0;
		font-size: 0.82rem;
		color: var(--text-dim);
	}

	.hint-note.book {
		color: var(--accent);
	}

	.hint-note.engine {
		color: #6ea8d8;
	}

	.callout {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.5rem 0.6rem;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 6px;
		font-size: 0.9rem;
	}

	.move {
		font-weight: 600;
	}

	.badge {
		border-radius: 999px;
		padding: 0.05rem 0.55rem;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.badge.book-best,
	.badge.best {
		background: var(--accent);
		color: #fff;
	}

	.badge.book {
		background: #a1887f;
		color: #fff;
	}

	.badge.good {
		background: #4f7942;
		color: #fff;
	}

	.badge.inaccuracy {
		background: var(--warn);
		color: #222;
	}

	.badge.mistake {
		background: #e07a3f;
		color: #fff;
	}

	.badge.blunder {
		background: var(--danger);
		color: #fff;
	}

	.badge.pending {
		background: var(--panel-raised);
		color: var(--text-dim);
	}

	.detail {
		color: var(--text-dim);
		font-size: 0.78rem;
	}
</style>
