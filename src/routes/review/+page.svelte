<script lang="ts">
	import Board from '$lib/board/Board.svelte';
	import MoveList from '$lib/trainer/MoveList.svelte';
	import EvalGraph from '$lib/review/EvalGraph.svelte';
	import { fetchGames, type ReviewGame, type Site } from '$lib/review/fetch';
	import { pgnToMoves } from '$lib/review/pgn';
	import { analyseGame, type GameReport } from '$lib/review/analyse';
	import type { FeedbackItem } from '$lib/trainer/trainer.svelte';
	import type { PlayedMove } from '$lib/game.svelte';
	import type { Key } from 'chessground/types';
	import { Chess, DEFAULT_POSITION } from 'chess.js';
	import { browser } from '$app/environment';

	// --- Fetch state ---
	let site = $state<Site>(browser ? ((localStorage.getItem('oct:review:site') as Site) ?? 'chess.com') : 'chess.com');
	let username = $state(browser ? (localStorage.getItem('oct:review:user') ?? '') : '');
	let fetching = $state(false);
	let fetchError = $state<string | null>(null);
	let games = $state<ReviewGame[] | null>(null);

	// --- Viewer state ---
	let current = $state<ReviewGame | null>(null);
	let moves = $state<PlayedMove[]>([]);
	let viewPly = $state(0);
	let flipped = $state(false);

	// --- Analysis state ---
	let report = $state<GameReport | null>(null);
	let analysing = $state(false);
	let progress = $state(0);
	let movetime = $state(300);
	let cancelToken: { cancelled: boolean } | null = null;

	const shownFen = $derived(
		viewPly === 0 ? (moves[0]?.fenBefore ?? DEFAULT_POSITION) : moves[viewPly - 1].fenAfter
	);
	const shownLastMove = $derived.by<[Key, Key] | undefined>(() => {
		const m = moves[viewPly - 1];
		return m ? [m.uci.slice(0, 2) as Key, m.uci.slice(2, 4) as Key] : undefined;
	});
	const shownCheck = $derived(new Chess(shownFen).inCheck());
	const shownTurn = $derived<'white' | 'black'>(viewPly % 2 === 0 ? 'white' : 'black');

	const feedbackByPly = $derived.by(() => {
		const map = new Map<number, FeedbackItem>();
		if (!report) return map;
		for (const m of report.moves) {
			map.set(m.ply, {
				ply: m.ply,
				moveNumber: Math.floor(m.ply / 2) + 1,
				san: m.san,
				badge: m.quality,
				detail: `${Math.round(m.accuracy)}% accuracy`
			});
		}
		return map;
	});

	async function submit() {
		fetching = true;
		fetchError = null;
		games = null;
		try {
			games = await fetchGames(site, username);
			localStorage.setItem('oct:review:site', site);
			localStorage.setItem('oct:review:user', username.trim());
		} catch (err) {
			fetchError = err instanceof Error ? err.message : 'Could not fetch games. Are you offline?';
		} finally {
			fetching = false;
		}
	}

	function openGame(g: ReviewGame) {
		try {
			moves = pgnToMoves(g.pgn);
		} catch {
			fetchError = 'Could not parse that game.';
			return;
		}
		current = g;
		fetchError = null;
		report = null;
		viewPly = 0;
		// Show the reviewed player's perspective by default.
		flipped = g.black.name.toLowerCase() === username.trim().toLowerCase();
	}

	function closeGame() {
		cancelToken && (cancelToken.cancelled = true);
		analysing = false;
		current = null;
		report = null;
	}

	async function analyse() {
		if (analysing || moves.length === 0) return;
		analysing = true;
		progress = 0;
		cancelToken = { cancelled: false };
		try {
			const result = await analyseGame(moves, {
				movetimeMs: movetime,
				onProgress: (done, total) => (progress = done / total),
				signal: cancelToken
			});
			if (result) report = result;
		} finally {
			analysing = false;
		}
	}

	function navTo(ply: number) {
		viewPly = Math.max(0, Math.min(ply, moves.length));
	}

	function onKeydown(e: KeyboardEvent) {
		if (!current) return;
		const target = e.target as HTMLElement | null;
		if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
		if (e.key === 'ArrowLeft') {
			navTo(viewPly - 1);
			e.preventDefault();
		} else if (e.key === 'ArrowRight') {
			navTo(viewPly + 1);
			e.preventDefault();
		}
	}

	const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
</script>

<svelte:window onkeydown={onKeydown} />

{#if !current}
	<section class="picker">
		<h2>Game review</h2>
		<p class="sub">Fetch your recent games and analyze them locally — nothing leaves your browser.</p>

		<form
			class="fetch-form"
			onsubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<div class="site-picker">
				<button
					type="button"
					class="side"
					class:selected={site === 'chess.com'}
					onclick={() => (site = 'chess.com')}>Chess.com</button
				>
				<button
					type="button"
					class="side"
					class:selected={site === 'lichess'}
					onclick={() => (site = 'lichess')}>Lichess</button
				>
			</div>
			<div class="row">
				<input type="text" placeholder="Username" bind:value={username} />
				<button class="btn" disabled={fetching || !username.trim()}>
					{fetching ? 'Fetching…' : 'Fetch games'}
				</button>
			</div>
		</form>

		{#if fetchError}
			<p class="error">{fetchError}</p>
		{/if}

		{#if games}
			{#if games.length === 0}
				<p class="sub">No standard games found for this account.</p>
			{:else}
				<ul class="games">
					{#each games as g (g.site + g.id)}
						<li>
							<button class="game" onclick={() => openGame(g)}>
								<span class="players">
									{g.white.name}{g.white.rating ? ` (${g.white.rating})` : ''} –
									{g.black.name}{g.black.rating ? ` (${g.black.rating})` : ''}
								</span>
								<span class="meta">{g.result} · {g.speed} · {dateFmt.format(g.endTime)}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</section>
{:else}
	<div class="review">
		<div class="board-col">
			<Board
				fen={shownFen}
				turnColor={shownTurn}
				orientation={flipped ? 'black' : 'white'}
				lastMove={shownLastMove}
				check={shownCheck}
			/>
			{#if report}
				<EvalGraph {report} shownPly={viewPly} onSelect={navTo} />
			{/if}
		</div>

		<aside class="panel">
			<button class="btn btn-secondary back" onclick={closeGame}>← Games</button>

			<div class="summary">
				{current.white.name} – {current.black.name}
				<span class="meta">{current.result} · {current.speed}</span>
			</div>

			{#if report}
				<div class="accuracy">
					<div><span class="acc-label">White accuracy</span> <strong>{report.accuracy.white.toFixed(1)}%</strong></div>
					<div><span class="acc-label">Black accuracy</span> <strong>{report.accuracy.black.toFixed(1)}%</strong></div>
				</div>
			{:else if analysing}
				<div class="progress">
					<div class="bar" style="width: {Math.round(progress * 100)}%"></div>
				</div>
				<button class="btn btn-secondary" onclick={() => cancelToken && (cancelToken.cancelled = true)}>
					Cancel ({Math.round(progress * 100)}%)
				</button>
			{:else}
				<div class="analyse-row">
					<select bind:value={movetime} aria-label="Analysis depth">
						<option value={150}>Fast (~{Math.round((moves.length * 0.15 + 1) / 6) * 10}s)</option>
						<option value={300}>Normal (~{Math.round((moves.length * 0.3 + 1) / 6) * 10}s)</option>
						<option value={600}>Deep (~{Math.round((moves.length * 0.6 + 1) / 6) * 10}s)</option>
					</select>
					<button class="btn" onclick={analyse}>Analyse</button>
				</div>
			{/if}

			<div class="nav" role="group" aria-label="Move navigation">
				<button title="Start" onclick={() => navTo(0)} disabled={viewPly === 0}>⏮</button>
				<button title="Previous (←)" onclick={() => navTo(viewPly - 1)} disabled={viewPly === 0}>←</button>
				<button title="Next (→)" onclick={() => navTo(viewPly + 1)} disabled={viewPly >= moves.length}>→</button>
				<button title="End" onclick={() => navTo(moves.length)} disabled={viewPly >= moves.length}>⏭</button>
				<button title="Flip board" onclick={() => (flipped = !flipped)}>⇅</button>
			</div>

			<MoveList history={moves} {feedbackByPly} shownPly={viewPly} onSelect={navTo} />
		</aside>
	</div>
{/if}

<style>
	.picker {
		max-width: 34rem;
		margin: 0 auto;
	}

	h2 {
		margin: 0 0 0.25rem;
	}

	.sub {
		color: var(--text-dim);
		margin: 0 0 1.25rem;
	}

	.fetch-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.site-picker {
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

	.row {
		display: flex;
		gap: 0.5rem;
	}

	input {
		flex: 1;
		background: var(--panel-raised);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.55rem 0.7rem;
		font: inherit;
	}

	.error {
		color: var(--danger);
	}

	.games {
		list-style: none;
		margin: 1.25rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.game {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.75rem;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.6rem 0.9rem;
		color: var(--text);
		text-align: left;
	}

	.game:hover {
		border-color: var(--accent);
	}

	.players {
		font-weight: 600;
	}

	.meta {
		color: var(--text-dim);
		font-size: 0.82rem;
		white-space: nowrap;
	}

	.review {
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
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
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

	.back {
		align-self: flex-start;
		padding: 0.35rem 0.8rem;
	}

	.summary {
		font-weight: 600;
		font-size: 0.95rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.accuracy {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		background: var(--panel-raised);
		border-radius: 6px;
		padding: 0.6rem 0.8rem;
		font-size: 0.9rem;
	}

	.acc-label {
		color: var(--text-dim);
	}

	.analyse-row {
		display: flex;
		gap: 0.5rem;
	}

	.analyse-row select {
		flex: 1;
		background: var(--panel-raised);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.45rem;
		font: inherit;
	}

	.progress {
		height: 0.5rem;
		background: var(--panel-raised);
		border-radius: 999px;
		overflow: hidden;
	}

	.bar {
		height: 100%;
		background: var(--accent);
		transition: width 0.2s;
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
		.review {
			flex-direction: column;
		}

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
