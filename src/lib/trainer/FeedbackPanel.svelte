<script lang="ts">
	import { BADGE_LABEL, type Trainer, type FeedbackItem } from './trainer.svelte';

	interface Props {
		trainer: Trainer;
		/** Feedback for the move shown on the board; defaults to the latest one. */
		feedback?: FeedbackItem | null;
	}

	let { trainer, feedback }: Props = $props();

	const last = $derived(feedback === undefined ? trainer.lastFeedback : feedback);
	/** Compact label for the pill: the pending state shows a terse ellipsis. */
	const badgeLabel = (badge: FeedbackItem['badge']) => (badge === 'pending' ? '…' : BADGE_LABEL[badge]);
</script>

<div class="feedback">
	{#if trainer.hint}
		<p class="hint-note {trainer.hint.source}">
			{#if trainer.hint.source === 'book'}
				Book suggests the green arrow.
			{:else if trainer.hint.bookRejected}
				The most-played book move scores poorly here — the engine's move (blue arrow) is stronger.
			{:else}
				Engine suggests the blue arrow.
			{/if}
		</p>
	{/if}

	<div class="callout-slot">
		{#if last}
			<div class="callout {last.badge}">
				<span class="move">{last.label} {last.san}</span>
				<span class="badge {last.badge}">{badgeLabel(last.badge)}</span>
				{#if last.detail}<span class="detail">{last.detail}</span>{/if}
			</div>
		{:else}
			<p class="placeholder">Feedback on your moves appears here.</p>
		{/if}
	</div>
</div>

<style>
	.feedback {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	/* Reserve the height of a typical callout (one move line + one detail line) so
	 * feedback appearing/disappearing doesn't shift the panels below. */
	.callout-slot {
		min-height: 3.5rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.placeholder {
		margin: 0;
		padding: 0.6rem 0.7rem;
		color: var(--text-dim);
		font-size: 0.82rem;
		font-style: italic;
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
		border-left-color: var(--q-mistake);
		background: color-mix(in srgb, var(--q-mistake) 16%, transparent);
	}

	.callout.blunder {
		border-left-color: var(--danger);
		background: color-mix(in srgb, var(--danger) 18%, transparent);
	}

	.callout.best,
	.callout.excellent,
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
	.badge.best,
	.badge.excellent {
		background: var(--accent);
		color: #fff;
	}

	.badge.book {
		background: var(--q-book);
		color: #fff;
	}

	.badge.good {
		background: var(--q-good);
		color: #fff;
	}

	.badge.inaccuracy {
		background: var(--warn);
		color: #222;
	}

	.badge.mistake {
		background: var(--q-mistake);
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
