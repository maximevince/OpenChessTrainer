<script lang="ts">
	import type { EvalScore } from '$lib/engine/uci';
	import { winPct } from '$lib/review/accuracy';
	import { formatEval } from '$lib/trainer/classify';

	/** null = evaluation pending: render a neutral bar so the board doesn't shift when the first eval lands. */
	let { score, flipped = false }: { score: EvalScore | null; flipped?: boolean } = $props();
</script>

<div class="eval-bar" class:flipped title={score ? formatEval(score) : 'Evaluating…'}>
	<div class="eval-fill" style="height: {score ? winPct(score) : 50}%"></div>
	{#if score}
		<span class="eval-num">{formatEval(score, 1)}</span>
	{/if}
</div>

<style>
	.eval-bar {
		position: relative;
		width: 0.9rem;
		border-radius: 4px;
		background: #3a3733;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
	}

	.eval-num {
		position: absolute;
		bottom: 0.2rem;
		left: 50%;
		transform: translateX(-50%);
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0 0.2rem;
		font-size: 0.62rem;
		font-weight: 600;
		white-space: nowrap;
		z-index: 1;
	}

	.eval-bar.flipped {
		justify-content: flex-start;
	}

	.eval-fill {
		background: #e8e6e3;
		border-radius: 3px;
		transition: height 0.2s;
	}
</style>
