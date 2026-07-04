<script lang="ts">
	import Board from '$lib/board/Board.svelte';
	import { Trainer, type FeedbackItem } from '$lib/trainer/trainer.svelte';
	import FeedbackPanel from '$lib/trainer/FeedbackPanel.svelte';
	import MoveList from '$lib/trainer/MoveList.svelte';
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
	const userTurn = $derived(trainer.phase === 'userTurn');
	/** Setup (pick opening/settings) vs playing (compact controls). */
	const inSetup = $derived(trainer.phase === 'idle' || trainer.phase === 'gameOver');

	const feedbackByPly = $derived(new Map<number, FeedbackItem>(trainer.feedback.map((f) => [f.ply, f])));

	const summary = $derived.by(() => {
		if (!trainer.opening) return `Free play — you are ${trainer.userSide}`;
		const verb = trainer.mode === 'play' ? 'Playing' : 'Refuting';
		return `${verb} the ${trainer.opening.name} as ${trainer.userSide}`;
	});

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
		{#if resultText}
			<div class="banner">{resultText}</div>
		{/if}

		{#if inSetup}
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

			<button class="btn" onclick={() => trainer.start()}>
				{trainer.phase === 'gameOver' ? 'Play again' : 'New Game'}
			</button>
		{:else}
			<div class="summary">
				{summary} <span class="elo">· Elo {trainer.elo}</span>
			</div>

			{#if trainer.opening && !trainer.inBook}
				<div class="chip">Out of book — engine (Elo {trainer.elo}) takes over</div>
			{/if}

			{#if trainer.phase === 'botThinking'}
				<p class="status">Thinking…</p>
			{/if}

			<FeedbackPanel {trainer} />

			<button class="btn btn-secondary" onclick={() => trainer.endGame()}>End game</button>
		{/if}

		{#if game.history.length > 0}
			<MoveList history={game.history} {feedbackByPly} />
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

	.summary {
		font-weight: 600;
		font-size: 0.95rem;
	}

	.summary .elo {
		color: var(--text-dim);
		font-weight: 400;
		white-space: nowrap;
	}

	@media (max-width: 800px) {
		.train {
			flex-direction: column;
		}

		/* flex: 1 with basis 0 collapses the board to zero height in column flow */
		.board-col {
			flex: none;
			width: 100%;
			max-width: none;
		}

		.panel {
			width: 100%;
		}
	}
</style>
