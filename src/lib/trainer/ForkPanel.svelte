<script lang="ts">
	import type { Trainer } from './trainer.svelte';
	import { resolvePinnedMove, namedBranchesAt } from '$lib/openings/pinning';
	import type { BookNode, OpeningVariation } from '$lib/openings/types';

	interface Props {
		trainer: Trainer;
	}

	let { trainer }: Props = $props();

	// Reactive: currentBookNode() reads opening/inBook/game state, so this recomputes.
	const node = $derived(trainer.currentBookNode());
	const played = $derived(trainer.game.uciMoves);

	const children = $derived.by<BookNode[]>(() => {
		const kids = node?.children ?? [];
		// Show the most-played first; keep it stable for a steady list.
		return [...kids].sort((a, b) => b.weight - a.weight);
	});

	const totalWeight = $derived(children.reduce((s, c) => s + c.weight, 0));
	const maxWeight = $derived(children.length ? Math.max(...children.map((c) => c.weight)) : 0);
	const named = $derived(namedBranchesAt(trainer.opening?.variations, played));
	const pinnedNextUci = $derived(
		node ? (resolvePinnedMove(trainer.pinnedLine, played, node)?.uci ?? null) : null
	);

	/** Whose move it is at this fork — labels the panel and the arrow meaning. */
	const sideToMove = $derived(trainer.game.turn === trainer.userSide ? 'you' : 'bot');

	const show = $derived(trainer.inBook && !trainer.practice && children.length >= 2);

	function share(node: BookNode): number {
		return totalWeight > 0 ? Math.round((100 * node.weight) / totalWeight) : 0;
	}

	/** The named variation a child begins, if any (so we can pin the whole line). */
	function variationFor(uci: string): OpeningVariation | undefined {
		const vars = trainer.opening?.variations;
		if (!vars) return undefined;
		return vars.find(
			(v) =>
				v.uci.length > played.length &&
				v.uci[played.length] === uci &&
				played.every((m, i) => v.uci[i] === m)
		);
	}

	function choose(child: BookNode): void {
		const v = variationFor(child.uci);
		if (v) trainer.pinVariation(v);
		else trainer.pinNextMove(child.uci);
	}
</script>

{#if show}
	<div class="fork">
		<div class="fork-head">
			<span>Branches here — {sideToMove === 'bot' ? 'pick the bot’s line' : 'your options'}</span>
			{#if trainer.pinnedLine}
				<button class="link" onclick={() => trainer.clearPin()}>Clear</button>
			{/if}
		</div>
		<ul>
			{#each children as child (child.uci)}
				{@const name = named.get(child.uci)}
				<li>
					<button
						class="branch"
						class:pinned={child.uci === pinnedNextUci}
						onclick={() => choose(child)}
						title={name ? `Pin: ${name}` : 'Route the bot down this move'}
					>
						<span class="san">{child.san}</span>
						<span class="tags">
							{#if child.uci === pinnedNextUci}<span class="tag pin">pinned</span>{/if}
							{#if child.trap}<span class="tag trap">trap</span>
							{:else if child.forced}<span class="tag forced">theory</span>{/if}
							{#if child.weight === maxWeight && !child.trap}<span class="tag main">main</span>{/if}
							{#if name}<span class="tag named">{name}</span>{/if}
						</span>
						<span class="pct">{share(child)}%</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.fork {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.6rem 0.7rem;
		background: rgba(255, 255, 255, 0.03);
	}

	.fork-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--text-dim);
	}

	.link {
		background: none;
		border: none;
		color: var(--accent);
		padding: 0;
		font-size: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.branch {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--panel-raised);
		color: var(--text);
		cursor: pointer;
		text-align: left;
	}

	.branch:hover {
		border-color: var(--accent);
	}

	.branch.pinned {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 20%, var(--panel-raised));
	}

	.san {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		min-width: 3.2rem;
	}

	.tags {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
		flex: 1;
		min-width: 0;
	}

	.tag {
		border-radius: 999px;
		padding: 0.02rem 0.45rem;
		font-size: 0.66rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		white-space: nowrap;
	}

	.tag.main {
		background: var(--accent);
		color: #fff;
	}

	.tag.trap {
		background: var(--danger);
		color: #fff;
	}

	.tag.forced {
		background: #a1887f;
		color: #fff;
	}

	.tag.pin {
		background: #6ea8d8;
		color: #10202c;
	}

	.tag.named {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text-dim);
		text-transform: none;
		font-weight: 600;
		letter-spacing: 0;
		/* Long line names must wrap inside the narrow panel, not overflow it. */
		white-space: normal;
		flex-basis: 100%;
	}

	.pct {
		color: var(--text-dim);
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>
