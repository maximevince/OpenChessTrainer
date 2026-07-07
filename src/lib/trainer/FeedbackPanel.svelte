<script lang="ts">
	import { BADGE_LABEL, type Trainer, type FeedbackItem, type Hint } from './trainer.svelte';

	export type PreviewLine = 'best' | 'refutation';

	interface Props {
		trainer?: Trainer;
		/** Feedback for the move shown on the board; defaults to the latest one. */
		feedback?: FeedbackItem | null;
		/** Hint to explain, defaults to the trainer's current hint. */
		hint?: Hint | null;
		/** Prefix for the verdict line. Trainer defaults to "You played". */
		moverLabel?: string;
		/** Neutral empty-state copy for non-trainer consumers. */
		placeholder?: string;
		/** When set, engine-line moves become clickable and step the board into
		 * the line (`step` = plies of the line shown, 1 = after its first move). */
		onPreview?: (line: PreviewLine, step: number) => void;
		/** Currently previewed step, to highlight the active move token. */
		preview?: { line: PreviewLine; step: number } | null;
	}

	let {
		trainer,
		feedback,
		hint,
		moverLabel = 'You played',
		placeholder = 'Feedback on your moves appears here.',
		onPreview,
		preview = null
	}: Props = $props();

	const last = $derived(feedback === undefined ? (trainer?.lastFeedback ?? null) : feedback);
	const shownHint = $derived(hint === undefined ? (trainer?.hint ?? null) : hint);
	/** Compact label for the pill: the pending state shows a terse ellipsis. */
	const badgeLabel = (badge: FeedbackItem['badge']) => (badge === 'pending' ? '…' : BADGE_LABEL[badge]);
</script>

<div class="feedback">
	{#if shownHint}
		<p class="hint-note {shownHint.source}">
			{#if shownHint.source === 'book'}
				Book suggests the green arrow.
			{:else if shownHint.bookRejected}
				The most-played book move scores poorly here — the engine's move (blue arrow) is stronger.
			{:else}
				Engine suggests the blue arrow.
			{/if}
		</p>
	{/if}

	<div class="callout-slot">
		{#if last}
			<div class="callout {last.badge}">
				<!-- The mover label keeps the verdict from reading as a move suggestion. -->
				<span class="who">{moverLabel}</span>
				<span class="move">{last.label} {last.san}</span>
				<span class="badge {last.badge}">{badgeLabel(last.badge)}</span>
				{#if last.detail}<span class="detail">{last.detail}</span>{/if}
				{#if last.explain}
					<div class="why">
						{#if last.explain.reason}
							<p class="reason">{last.explain.reason}</p>
						{/if}
						{#if onPreview && last.explain.bestLine.length > 0}
							<p>
								{last.explain.motif?.kind === 'missed-mate'
									? 'The mate:'
									: last.explain.bestLine.length > 1
										? 'Best line:'
										: 'Best was'}
								{#each last.explain.bestLine as m, i (i)}
									<button
										class="tok"
										class:active={preview?.line === 'best' && preview.step === i + 1}
										title="Show on the board"
										onclick={() => onPreview?.('best', i + 1)}>{m.numbered}</button
									>
								{/each}
							</p>
						{:else if last.explain.bestSan && last.explain.motif?.kind !== 'missed-mate'}
							<p>Best was <strong>{last.explain.bestSan}</strong>.</p>
						{/if}
						{#if onPreview && last.explain.refutation.length > 0}
							<p>
								Strongest reply:
								{#each last.explain.refutation as m, i (i)}
									<button
										class="tok"
										class:active={preview?.line === 'refutation' && preview.step === i + 1}
										title="Show on the board"
										onclick={() => onPreview?.('refutation', i + 1)}>{m.numbered}</button
									>
								{/each}
							</p>
						{:else if last.explain.refutationLine}
							<p>Strongest reply: <strong>{last.explain.refutationLine}</strong></p>
						{/if}
					</div>
				{/if}
			</div>
		{:else}
			<p class="placeholder">{placeholder}</p>
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

	.who {
		color: var(--text-dim);
		font-size: 0.78rem;
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

	/* The "why" block breaks below the badge row and reads as its own lines. */
	.why {
		flex-basis: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-size: 0.82rem;
	}

	.why p {
		margin: 0;
	}

	/* The named motif is the headline of the "why" — full-strength text. */
	.why .reason {
		color: var(--text);
		font-weight: 500;
	}

	/* Engine-line moves read as bold text but click like buttons. */
	.tok {
		background: none;
		border: none;
		padding: 0 0.15rem;
		margin: 0;
		font: inherit;
		font-weight: 600;
		color: var(--text);
		cursor: pointer;
		border-radius: 4px;
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}

	.tok:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.tok.active {
		background: var(--accent);
		color: #fff;
		text-decoration: none;
	}
</style>
