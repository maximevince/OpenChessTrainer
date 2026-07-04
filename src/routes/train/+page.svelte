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
	import { Chess, DEFAULT_POSITION } from 'chess.js';
	import { VERDICT_GLYPH } from '$lib/verdict';

	const trainer = new Trainer();

	let openings = $state<OpeningIndexEntry[]>([]);
	let selectedOpening = $state<string>('');
	let indexError = $state(false);

	const SETTINGS_KEY = 'oct:train:settings';
	const DEFAULT_OPENING = 'london';
	let settingsLoaded = false;

	$effect(() => {
		loadIndex().then(
			(idx) => {
				openings = idx.openings;
				restoreSettings(idx.openings);
			},
			() => (indexError = true)
		);
	});

	function restoreSettings(available: OpeningIndexEntry[]) {
		let stored: Record<string, unknown> = {};
		try {
			stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
		} catch {
			// corrupt settings — fall through to defaults
		}
		if (typeof stored.elo === 'number') trainer.elo = stored.elo;
		if (typeof stored.variability === 'number') trainer.variability = stored.variability;
		if (stored.mode === 'play' || stored.mode === 'refute') trainer.mode = stored.mode;
		if (stored.manualSide === 'white' || stored.manualSide === 'black') {
			trainer.manualSide = stored.manualSide;
		}
		// Default to a real opening — this is an opening trainer, not a bare engine.
		const openingId =
			typeof stored.opening === 'string' &&
			(stored.opening === '' || available.some((o) => o.id === stored.opening))
				? stored.opening
				: DEFAULT_OPENING;
		if (openingId) void pickOpening(openingId);
		settingsLoaded = true;
	}

	$effect(() => {
		const settings = {
			opening: selectedOpening,
			mode: trainer.mode,
			manualSide: trainer.manualSide,
			elo: trainer.elo,
			variability: trainer.variability
		};
		if (settingsLoaded) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
	});

	const game = trainer.game;
	const userTurn = $derived(trainer.phase === 'userTurn');
	/** Setup (pick opening/settings) vs playing (compact controls). */
	const inSetup = $derived(trainer.phase === 'idle' || trainer.phase === 'gameOver');

	const feedbackByPly = $derived(new Map<number, FeedbackItem>(trainer.feedback.map((f) => [f.ply, f])));

	// --- View-only navigation through played moves (game state untouched) ---
	/** Number of plies shown; null = live position. */
	let viewPly = $state<number | null>(null);

	// Snap back to live whenever a move is played or a game starts/rewinds.
	$effect(() => {
		game.history.length;
		viewPly = null;
	});

	const shownPly = $derived(viewPly ?? game.history.length);
	const viewingLive = $derived(shownPly >= game.history.length);
	const shownFen = $derived(
		viewingLive ? game.fen : shownPly === 0 ? DEFAULT_POSITION : game.history[shownPly - 1].fenAfter
	);
	const shownLastMove = $derived.by<[Key, Key] | undefined>(() => {
		if (viewingLive) return game.lastMove;
		const m = game.history[shownPly - 1];
		return m ? [m.uci.slice(0, 2) as Key, m.uci.slice(2, 4) as Key] : undefined;
	});
	const shownCheck = $derived(viewingLive ? game.inCheck : new Chess(shownFen).inCheck());
	const shownTurn = $derived<'white' | 'black'>(
		viewingLive ? game.turn : shownPly % 2 === 0 ? 'white' : 'black'
	);

	function navTo(ply: number) {
		const clamped = Math.max(0, Math.min(ply, game.history.length));
		viewPly = clamped >= game.history.length ? null : clamped;
	}

	function onKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
		if (e.key === 'ArrowLeft') {
			navTo(shownPly - 1);
			e.preventDefault();
		} else if (e.key === 'ArrowRight') {
			navTo(shownPly + 1);
			e.preventDefault();
		}
	}

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

	const verdictShapes = $derived.by<DrawShape[]>(() => {
		const f = trainer.lastFeedback;
		if (!f) return [];
		const glyph = VERDICT_GLYPH[f.badge];
		const m = game.history[f.ply];
		if (!glyph || !m) return [];
		return [{ orig: m.uci.slice(2, 4) as Key, label: glyph }];
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

<svelte:window onkeydown={onKeydown} />

<div class="train">
	<div class="board-col">
		<Board
			fen={shownFen}
			turnColor={shownTurn}
			orientation={trainer.userSide}
			dests={game.dests}
			movableColor={viewingLive && userTurn ? trainer.userSide : undefined}
			lastMove={shownLastMove}
			check={shownCheck}
			shapes={viewingLive ? [...hintShapes, ...verdictShapes] : []}
			{onUserMove}
		/>
		{#if !viewingLive}
			<div class="browse-note">
				Viewing move {Math.ceil(shownPly / 2) || '—'} of {Math.ceil(game.history.length / 2)}
				<button class="link" onclick={() => navTo(game.history.length)}>Back to live</button>
			</div>
		{/if}
		{#if trainer.phase === 'idle' && game.history.length === 0}
			<div class="board-hint">
				<span>Pick an opening, then press <strong>New Game</strong></span>
			</div>
		{/if}
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
			<div class="nav" role="group" aria-label="Move navigation">
				<button title="First move" onclick={() => navTo(0)} disabled={shownPly === 0}>⏮</button>
				<button title="Previous move (←)" onclick={() => navTo(shownPly - 1)} disabled={shownPly === 0}>←</button>
				<button title="Next move (→)" onclick={() => navTo(shownPly + 1)} disabled={viewingLive}>→</button>
				<button title="Back to live" onclick={() => navTo(game.history.length)} disabled={viewingLive}>⏭</button>
			</div>
			<MoveList history={game.history} {feedbackByPly} {shownPly} onSelect={navTo} />
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
		position: relative;
	}

	.board-hint {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(38, 36, 33, 0.55);
		pointer-events: none;
	}

	.board-hint span {
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.7rem 1.2rem;
		font-size: 1rem;
		color: var(--text);
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

	.browse-note {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.4rem 0;
		color: var(--text-dim);
		font-size: 0.85rem;
	}

	.link {
		background: none;
		border: none;
		color: var(--accent);
		padding: 0;
		font-size: inherit;
		text-decoration: underline;
	}

	.nav {
		display: flex;
		gap: 0.4rem;
	}

	.nav button {
		flex: 1;
		background: var(--panel-raised);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.3rem 0;
		font-size: 0.9rem;
	}

	.nav button:disabled {
		opacity: 0.35;
		cursor: default;
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
