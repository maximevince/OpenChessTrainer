<script lang="ts">
	import Board from '$lib/board/Board.svelte';
	import { Trainer } from '$lib/trainer/trainer.svelte';
	import FeedbackPanel from '$lib/trainer/FeedbackPanel.svelte';
	import { loadIndex } from '$lib/openings/tree';
	import { MIN_ELO, MAX_ELO, UCI_ELO_FLOOR } from '$lib/engine/engine';
	import type { OpeningIndexEntry } from '$lib/openings/types';
	import type { DrawShape } from 'chessground/draw';
	import type { Key } from 'chessground/types';

	const trainer = new Trainer();

	let openings = $state<OpeningIndexEntry[]>([]);
	let selectedOpening = $state<string>('');
	let indexError = $state(false);

	$effect(() => {
		loadIndex().then(
			(idx) => (openings = idx.openings),
			() => (indexError = true)
		);
	});

	const game = trainer.game;
	const started = $derived(trainer.phase !== 'idle');
	const userTurn = $derived(trainer.phase === 'userTurn');

	const strengthLabel = $derived(
		trainer.elo < UCI_ELO_FLOOR ? `~${trainer.elo} (beginner)` : String(trainer.elo)
	);

	const hintShapes = $derived.by<DrawShape[]>(() => {
		const hint = trainer.hint;
		if (!hint) return [];
		return [
			{
				orig: hint.uci.slice(0, 2) as Key,
				dest: hint.uci.slice(2, 4) as Key,
				brush: hint.source === 'book' ? 'green' : 'blue'
			}
		];
	});

	const resultText = $derived.by(() => {
		const r = game.result;
		if (!r) return null;
		if (r.winner === null) return `Draw — ${r.reason}`;
		return `${r.winner === trainer.userSide ? 'You win' : 'You lose'} — ${r.reason}`;
	});

	async function pickOpening(id: string) {
		selectedOpening = id;
		await trainer.selectOpening(id || null);
	}

	function onUserMove(from: string, to: string) {
		trainer.onUserMove(from, to);
	}
</script>

<div class="train">
	<div class="board-col">
		<Board
			fen={game.fen}
			turnColor={game.turn}
			orientation={trainer.userSide}
			dests={game.dests}
			movableColor={userTurn ? trainer.userSide : undefined}
			lastMove={game.lastMove}
			check={game.inCheck}
			shapes={hintShapes}
			{onUserMove}
		/>
	</div>

	<aside class="panel">
		<h2>Trainer</h2>

		<label class="field">
			<span>Opening</span>
			<select
				value={selectedOpening}
				onchange={(e) => pickOpening(e.currentTarget.value)}
			>
				<option value="">Free play (no book)</option>
				{#each openings as o (o.id)}
					<option value={o.id}>{o.name}</option>
				{/each}
			</select>
			{#if indexError}
				<small class="error">Could not load openings list.</small>
			{:else if trainer.opening?.description}
				<small>{trainer.opening.description}</small>
			{/if}
		</label>

		{#if trainer.opening}
			<div class="field">
				<span>Goal</span>
				<div class="side-picker">
					<button
						class="side"
						class:selected={trainer.mode === 'play'}
						onclick={() => (trainer.mode = 'play')}>Learn to play it</button
					>
					<button
						class="side"
						class:selected={trainer.mode === 'refute'}
						onclick={() => (trainer.mode = 'refute')}>Learn to refute it</button
					>
				</div>
				<small>
					{#if trainer.mode === 'play'}
						You play the {trainer.opening.name} as {trainer.userSide}.
					{:else}
						The bot plays the {trainer.opening.name}; you counter as {trainer.userSide}.
					{/if}
				</small>
			</div>
		{:else}
			<div class="field">
				<span>Your side</span>
				<div class="side-picker">
					<button
						class="side"
						class:selected={trainer.userSide === 'white'}
						onclick={() => (trainer.manualSide = 'white')}>White</button
					>
					<button
						class="side"
						class:selected={trainer.userSide === 'black'}
						onclick={() => (trainer.manualSide = 'black')}>Black</button
					>
				</div>
			</div>
		{/if}

		<label class="field">
			<span>Strength: <strong>{strengthLabel}</strong></span>
			<input type="range" min={MIN_ELO} max={MAX_ELO} step="50" bind:value={trainer.elo} />
		</label>

		{#if trainer.opening}
			<label class="field">
				<span>Variability: <strong>{Math.round(trainer.variability * 100)}%</strong></span>
				<input type="range" min="0" max="1" step="0.05" bind:value={trainer.variability} />
				<small>0% always plays the main line; higher explores sidelines.</small>
			</label>
		{/if}

		<button class="btn" onclick={() => trainer.start()}>New Game</button>

		{#if started && trainer.opening && !trainer.inBook && trainer.phase !== 'gameOver'}
			<div class="chip">Out of book — engine (Elo {trainer.elo}) takes over</div>
		{/if}

		{#if trainer.phase === 'botThinking'}
			<p class="status">Thinking…</p>
		{/if}

		{#if resultText}
			<div class="banner">{resultText}</div>
		{/if}

		{#if started}
			<FeedbackPanel {trainer} />
		{/if}

		{#if started && game.history.length > 0}
			<ol class="moves">
				{#each game.history as m, i (i)}
					{#if i % 2 === 0}
						<li>
							<span class="num">{i / 2 + 1}.</span>
							<span class="san">{m.san}</span>
							<span class="san">{game.history[i + 1]?.san ?? ''}</span>
						</li>
					{/if}
				{/each}
			</ol>
		{/if}
	</aside>
</div>

<style>
	.train {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
		max-width: 72rem;
		margin: 0 auto;
	}

	.board-col {
		flex: 1;
		min-width: 0;
		max-width: min(80vh, 42rem);
	}

	.panel {
		width: 19rem;
		flex-shrink: 0;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		color: var(--text-dim);
		font-size: 0.9rem;
	}

	.field strong {
		color: var(--text);
	}

	.field small {
		color: var(--text-dim);
		font-size: 0.78rem;
		line-height: 1.35;
	}

	.field .error {
		color: var(--danger);
	}

	select {
		background: var(--panel-raised);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.45rem;
		font: inherit;
	}

	.side-picker {
		display: flex;
		gap: 0.5rem;
	}

	.side {
		flex: 1;
		padding: 0.45rem 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--panel-raised);
		color: var(--text);
	}

	.side:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.side.selected {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 22%, var(--panel-raised));
	}

	.chip {
		background: color-mix(in srgb, var(--warn) 18%, var(--panel-raised));
		border: 1px solid var(--warn);
		border-radius: 999px;
		padding: 0.35rem 0.8rem;
		font-size: 0.82rem;
		text-align: center;
	}

	.status {
		margin: 0;
		color: var(--text-dim);
		font-style: italic;
	}

	.banner {
		background: var(--panel-raised);
		border: 1px solid var(--accent);
		border-radius: 6px;
		padding: 0.6rem;
		text-align: center;
		font-weight: 600;
	}

	.moves {
		margin: 0;
		padding: 0;
		list-style: none;
		max-height: 12rem;
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

	@media (max-width: 800px) {
		.train {
			flex-direction: column;
		}

		.panel {
			width: 100%;
		}
	}
</style>
