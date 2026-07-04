<script lang="ts">
	import type { Trainer, FeedbackBadge, FeedbackItem } from './trainer.svelte';

	interface Props {
		trainer: Trainer;
		/** Feedback for the move shown on the board; defaults to the latest one. */
		feedback?: FeedbackItem | null;
	}

	let { trainer, feedback }: Props = $props();

	const BADGE_LABEL: Record<FeedbackBadge, string> = {
		'book-best': 'Book · main',
		book: 'Book',
		trap: 'Trap!',
		best: 'Best',
		good: 'Good',
		inaccuracy: 'Inaccuracy',
		mistake: 'Mistake',
		blunder: 'Blunder',
		pending: '…'
	};

	const last = $derived(feedback === undefined ? trainer.lastFeedback : feedback);
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
		{#if trainer.canTakeBack}
			<button
				class="btn {trainer.retrySuggested ? 'retry' : 'btn-secondary'}"
				onclick={() => trainer.takeBack()}
			>
				{trainer.retrySuggested ? 'Undo & retry' : 'Take back'}
			</button>
		{/if}
	</div>

	{#if trainer.hint}
		<p class="hint-note {trainer.hint.source}">
			{trainer.hint.source === 'book' ? 'Book suggests the green arrow.' : 'Engine suggests the blue arrow.'}
		</p>
	{/if}

	{#if last}
		<div class="callout {last.badge}">
			<span class="move">{last.label} {last.san}</span>
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
		padding: 0.6rem 0.7rem;
		background: rgba(255, 255, 255, 0.04);
		border-left: 4px solid transparent;
		border-radius: 6px;
		font-size: 0.95rem;
	}

	/* Severity tint: suboptimal moves must be impossible to miss. */
	.callout.inaccuracy {
		border-left-color: var(--warn);
		background: color-mix(in srgb, var(--warn) 14%, transparent);
	}

	.callout.mistake {
		border-left-color: #e07a3f;
		background: color-mix(in srgb, #e07a3f 16%, transparent);
	}

	.callout.blunder {
		border-left-color: var(--danger);
		background: color-mix(in srgb, var(--danger) 18%, transparent);
	}

	.callout.best,
	.callout.book-best,
	.callout.book,
	.callout.good {
		border-left-color: var(--accent);
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

	.badge.blunder,
	.badge.trap {
		background: var(--danger);
		color: #fff;
	}

	.callout.trap {
		border-left-color: var(--danger);
		background: color-mix(in srgb, var(--danger) 18%, transparent);
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
