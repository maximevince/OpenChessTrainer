<script lang="ts">
	import type { Color, GameResult } from '$lib/game.svelte';

	interface Props {
		result: GameResult;
		/** Point of view for the verdict line ("You win"); omit for neutral "White wins". */
		pov?: Color;
	}

	let { result, pov }: Props = $props();

	const title = $derived(
		result.reason === 'checkmate'
			? 'Checkmate'
			: result.winner === null
				? 'Draw'
				: 'Game over'
	);

	const detail = $derived.by(() => {
		if (result.winner === null) {
			// "Draw" title already says it; only add the reason when it's specific.
			return result.reason === 'draw' ? null : result.reason;
		}
		if (pov) return result.winner === pov ? 'You win' : 'You lose';
		return result.winner === 'white' ? 'White wins' : 'Black wins';
	});
</script>

<div class="overlay" role="status">
	<div class="card">
		<span class="title">{title}</span>
		{#if detail}<span class="detail">{detail}</span>{/if}
	</div>
</div>

<style>
	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		/* Above chessground pieces (z-index 2); nothing is draggable once the game ends. */
		z-index: 5;
		/* Slight scrim over the whole board: signals the position is final. */
		background: rgba(38, 36, 33, 0.3);
		/* Let the mating move's animation (150ms) land before fading in. */
		animation: fade-in 0.35s ease-out 0.4s backwards;
	}

	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		background: rgba(38, 36, 33, 0.85);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.7rem 1.4rem;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
	}

	.title {
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--text);
	}

	.detail {
		font-size: 0.9rem;
		color: var(--text-dim);
	}

	@keyframes fade-in {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
