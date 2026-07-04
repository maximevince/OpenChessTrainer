<script lang="ts">
	import Board from '$lib/board/Board.svelte';
	import { Game, type Color } from '$lib/game.svelte';
	import { engine, MIN_ELO, MAX_ELO, UCI_ELO_FLOOR } from '$lib/engine/engine';

	const game = new Game();

	let userSide = $state<Color>('white');
	let elo = $state(1600);
	let started = $state(false);
	let botThinking = $state(false);

	const userTurn = $derived(started && !game.isGameOver && game.turn === userSide && !botThinking);

	const strengthLabel = $derived(
		elo < UCI_ELO_FLOOR ? `~${elo} (beginner)` : String(elo)
	);

	const resultText = $derived.by(() => {
		const r = game.result;
		if (!r) return null;
		if (r.winner === null) return `Draw — ${r.reason}`;
		const won = r.winner === userSide;
		return `${won ? 'You win' : 'You lose'} — ${r.reason}`;
	});

	async function newGame() {
		game.reset();
		engine.setStrength({ elo });
		await engine.newGame();
		started = true;
		if (userSide === 'black') void botMove();
	}

	async function botMove() {
		botThinking = true;
		try {
			const fen = game.fen;
			const [{ uci }] = await Promise.all([
				engine.bestMove(fen, { movetimeMs: 400 }),
				// Small UX delay so instant replies still feel like a "thinking" opponent.
				new Promise((r) => setTimeout(r, 300))
			]);
			// Ignore stale replies (e.g. user hit New Game while the engine was thinking).
			if (uci && game.fen === fen) game.move(uci);
		} finally {
			botThinking = false;
		}
	}

	function onUserMove(from: string, to: string) {
		if (!userTurn) return;
		const played = game.move(from, to);
		if (!played) return;
		if (!game.isGameOver) void botMove();
	}
</script>

<div class="train">
	<div class="board-col">
		<Board
			fen={game.fen}
			orientation={userSide}
			dests={game.dests}
			movableColor={userTurn ? userSide : undefined}
			lastMove={game.lastMove}
			check={game.inCheck}
			{onUserMove}
		/>
	</div>

	<aside class="panel">
		<h2>Play vs Stockfish</h2>

		<label class="field">
			<span>Your side</span>
			<div class="side-picker">
				<button
					class="side"
					class:selected={userSide === 'white'}
					onclick={() => (userSide = 'white')}>White</button
				>
				<button
					class="side"
					class:selected={userSide === 'black'}
					onclick={() => (userSide = 'black')}>Black</button
				>
			</div>
		</label>

		<label class="field">
			<span>Strength: <strong>{strengthLabel}</strong></span>
			<input type="range" min={MIN_ELO} max={MAX_ELO} step="50" bind:value={elo} />
		</label>

		<button class="btn" onclick={newGame}>New Game</button>

		{#if botThinking}
			<p class="status">Thinking…</p>
		{/if}

		{#if resultText}
			<div class="banner">{resultText}</div>
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
		width: 18rem;
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

	.side.selected {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 22%, var(--panel-raised));
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

	@media (max-width: 800px) {
		.train {
			flex-direction: column;
		}

		.panel {
			width: 100%;
		}
	}
</style>
