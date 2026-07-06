<script lang="ts">
	import Board from '$lib/board/Board.svelte';
	import MoveList from '$lib/trainer/MoveList.svelte';
	import EvalGraph from '$lib/review/EvalGraph.svelte';
	import EvalBar from '$lib/board/EvalBar.svelte';
	import { fetchGames, type ReviewGame, type Site, type ViewerGame } from '$lib/review/fetch';
	import { parsePgn, pgnToMoves } from '$lib/pgn';
	import { takeReviewRequest } from '$lib/review/handoff';
	import { analyseGame, type GameReport } from '$lib/review/analyse';
	import type { FeedbackItem } from '$lib/trainer/trainer.svelte';
	import { plyLabel as formatPlyLabel, turnOfFen, type PlayedMove } from '$lib/game.svelte';
	import { positionAt, isTypingTarget } from '$lib/browse';
	import type { DrawShape } from 'chessground/draw';
	import type { Key } from 'chessground/types';
	import { Chess, DEFAULT_POSITION } from 'chess.js';
	import { browser } from '$app/environment';
	import { VERDICT_GLYPH } from '$lib/verdict';
	import { formatEval } from '$lib/trainer/classify';
	import { setPractice } from '$lib/practice';
	import { decodeShare, encodeShare } from '$lib/share';
	import ShareDialog from '$lib/ShareDialog.svelte';
	import { fileStamp } from '$lib/date';
	import { base } from '$app/paths';
	import { goto, replaceState } from '$app/navigation';

	// --- Fetch state ---
	type Source = Site | 'import';
	const SOURCES: Source[] = ['chess.com', 'lichess', 'import'];
	let source = $state<Source>(
		browser && SOURCES.includes(localStorage.getItem('oct:review:site') as Source)
			? (localStorage.getItem('oct:review:site') as Source)
			: 'chess.com'
	);
	let username = $state(browser ? (localStorage.getItem('oct:review:user') ?? '') : '');
	let fetching = $state(false);
	let fetchError = $state<string | null>(null);
	let games = $state<ReviewGame[] | null>(null);

	// --- Viewer state ---
	let current = $state<ViewerGame | null>(null);
	let moves = $state<PlayedMove[]>([]);
	let viewPly = $state(0);
	let flipped = $state(false);

	// Arriving from the trainer with a "review this game" request: open it immediately.
	const reviewRequest = takeReviewRequest();
	if (reviewRequest) {
		current = reviewRequest.game;
		moves = reviewRequest.moves;
		flipped = reviewRequest.orientation === 'black';
	} else if (browser && location.hash.length > 1) {
		// Shared link: the whole game state lives in the URL fragment.
		void openShared(location.hash);
	}

	async function openShared(fragment: string) {
		const shared = await decodeShare(fragment);
		if (shared?.kind !== 'review') return;
		importGame(shared.pgn);
		if (!current) return; // unparseable payload — stay on the picker
		viewPly = Math.max(0, Math.min(shared.ply ?? 0, moves.length));
		flipped = shared.flip === true;
	}

	// --- Share dialog (link + PGN copy/download) ---
	let shareOpen = $state(false);
	let shareLink = $state('');
	let shareFilename = $state('game.pgn');

	/** Build the share link for this game & position and open the dialog. */
	async function openShare() {
		if (!current) return;
		const fragment = await encodeShare({
			kind: 'review',
			pgn: current.pgn,
			...(viewPly > 0 ? { ply: viewPly } : {}),
			...(flipped ? { flip: true } : {})
		});
		replaceState(fragment, {});
		shareLink = `${location.origin}${base}/review${fragment}`;
		shareFilename = `game-${fileStamp(new Date())}.pgn`;
		shareOpen = true;
	}

	// --- Analysis state ---
	let report = $state<GameReport | null>(null);
	let analysing = $state(false);
	let progress = $state(0);
	let movetime = $state(300);
	let cancelToken: { cancelled: boolean } | null = null;

	// Leaving the page must stop the analysis loop, or it keeps hogging the
	// shared engine queue (e.g. slowing down the trainer after "Practice from here").
	$effect(() => () => {
		cancelToken && (cancelToken.cancelled = true);
	});

	// Board state for the browsed position. FEN-derived (not ply parity) so
	// imported/training games that start mid-game render correctly.
	const shown = $derived(positionAt(moves, viewPly));
	const shownFen = $derived(shown.fen);
	const shownLastMove = $derived(shown.lastMove);
	const shownCheck = $derived(shown.check);
	const shownTurn = $derived(shown.turn);

	// Start-position offsets for move numbering (≠ defaults when the game starts from a FEN).
	const startFen = $derived(moves[0]?.fenBefore ?? DEFAULT_POSITION);
	const startColor = $derived(turnOfFen(startFen));
	const startNumber = $derived(Number(startFen.split(' ')[5]) || 1);

	/** Preformatted move-number label for a ply, e.g. "12." or "12…". */
	function plyLabel(ply: number): string {
		return formatPlyLabel(ply, startColor, startNumber);
	}

	// --- Analysis-driven view extras ---
	let showEngineArrows = $state(true);

	/** Report entry for the move that led to the shown position. */
	const viewedMove = $derived(report && viewPly > 0 ? report.moves[viewPly - 1] : null);

	const shownEval = $derived(report ? report.evals[viewPly] : null);

	const bestWasSan = $derived.by(() => {
		if (!report || !viewedMove) return null;
		if (viewedMove.quality === 'best' || viewedMove.quality === 'book') return null;
		const best = report.evals[viewPly - 1].bestUci;
		if (!best) return null;
		try {
			const pos = new Chess(moves[viewPly - 1].fenBefore);
			const m = pos.move({
				from: best.slice(0, 2),
				to: best.slice(2, 4),
				promotion: best.slice(4, 5) || undefined
			});
			return m.san;
		} catch {
			return null;
		}
	});

	const boardShapes = $derived.by<DrawShape[]>(() => {
		const shapes: DrawShape[] = [];
		if (viewedMove) {
			const glyph = VERDICT_GLYPH[viewedMove.quality];
			const m = moves[viewPly - 1];
			if (glyph && m) shapes.push({ orig: m.uci.slice(2, 4) as Key, label: glyph });
		}
		if (report && showEngineArrows) {
			const best = report.evals[viewPly].bestUci;
			if (best) {
				shapes.push({ orig: best.slice(0, 2) as Key, dest: best.slice(2, 4) as Key, brush: 'blue' });
			}
		}
		return shapes;
	});

	const QUALITY_ROWS = [
		{ key: 'book', label: 'Book' },
		{ key: 'best', label: 'Best' },
		{ key: 'excellent', label: 'Excellent' },
		{ key: 'good', label: 'Good' },
		{ key: 'inaccuracy', label: 'Inaccuracies' },
		{ key: 'mistake', label: 'Mistakes' },
		{ key: 'blunder', label: 'Blunders' }
	] as const;

	/** Plies of both players' mistakes and blunders, for key-moment jumps. */
	const keyMoments = $derived(
		report
			? report.moves
					.filter((m) => m.quality === 'mistake' || m.quality === 'blunder')
					.map((m) => m.ply)
			: []
	);

	function jumpMoment(dir: 1 | -1) {
		const targets = keyMoments.map((p) => p + 1);
		const next =
			dir === 1
				? targets.find((t) => t > viewPly)
				: [...targets].reverse().find((t) => t < viewPly);
		if (next !== undefined) navTo(next);
	}

	const feedbackByPly = $derived.by(() => {
		const map = new Map<number, FeedbackItem>();
		if (!report) return map;
		for (const m of report.moves) {
			map.set(m.ply, {
				ply: m.ply,
				label: plyLabel(m.ply),
				san: m.san,
				badge: m.quality,
				detail: `${Math.round(m.accuracy)}% accuracy`
			});
		}
		return map;
	});

	const shownPositionOver = $derived(new Chess(shownFen).isGameOver());

	function practiceFromHere() {
		if (!current || shownPositionOver) return;
		const num = Number(shownFen.split(' ')[5]) || 1;
		setPractice({
			fen: shownFen,
			// ASCII hyphen only: this label ends up in PGN tag values, and byte-naive
			// parsers (e.g. GNOME Chess) reject any non-ASCII byte in the file.
			label: `${current.white.name} - ${current.black.name}, move ${num}`,
			// Plain copies: the moves leading here, so the trainer can show them.
			moves: moves.slice(0, viewPly).map((m) => ({ ...m }))
		});
		void goto(`${base}/train`);
	}

	// --- PGN / FEN import ---
	let importText = $state('');
	let importError = $state<string | null>(null);

	/** A single line that chess.js accepts as a position = FEN, not PGN. */
	function looksLikeFen(text: string): boolean {
		if (text.includes('\n') || text.includes('[')) return false;
		try {
			new Chess(text);
			return true;
		} catch {
			return false;
		}
	}

	/** First game of a possibly multi-game PGN file. */
	function firstGame(text: string): string {
		const second = text.indexOf('[Event ', text.indexOf('[Event ') + 1);
		return second > 0 ? text.slice(0, second) : text;
	}

	function headerOrUndef(headers: Record<string, string>, key: string): string | undefined {
		const v = headers[key];
		return v && v !== '?' ? v : undefined;
	}

	function importGame(text: string) {
		const trimmed = text.trim();
		if (!trimmed) return;
		importError = null;

		// A bare FEN is a position, not a game — hand it to the trainer instead.
		if (looksLikeFen(trimmed)) {
			setPractice({ fen: trimmed, label: 'Imported position' });
			void goto(`${base}/train`);
			return;
		}

		const pgn = firstGame(trimmed);
		let parsed: ReturnType<typeof parsePgn>;
		try {
			parsed = parsePgn(pgn);
		} catch {
			importError = 'Could not parse that — paste a PGN game or a FEN position.';
			return;
		}
		if (parsed.moves.length === 0) {
			importError = 'That PGN contains no moves.';
			return;
		}
		const h = parsed.headers;
		current = {
			white: { name: headerOrUndef(h, 'White') ?? 'White', rating: Number(h.WhiteElo) || undefined },
			black: { name: headerOrUndef(h, 'Black') ?? 'Black', rating: Number(h.BlackElo) || undefined },
			result: h.Result === '1-0' || h.Result === '0-1' ? h.Result : h.Result === '1/2-1/2' ? '½-½' : '*',
			speed: 'import',
			opening: headerOrUndef(h, 'Opening') ?? headerOrUndef(h, 'ECO'),
			pgn
		};
		moves = parsed.moves;
		report = null;
		viewPly = 0;
		flipped = false;
	}

	async function onImportFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		importText = await file.text();
		input.value = '';
		importGame(importText);
	}

	function pickSource(s: Source) {
		source = s;
		if (browser) localStorage.setItem('oct:review:site', s);
	}

	async function submit() {
		if (source === 'import') return;
		fetching = true;
		fetchError = null;
		games = null;
		try {
			games = await fetchGames(source, username);
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
		// A shared-link fragment describes the game we just closed — drop it.
		if (location.hash) replaceState(location.pathname + location.search, {});
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
		if (!current || isTypingTarget(e)) return;
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
		<p class="sub">
			{source === 'import'
				? 'Import a PGN game — or a FEN position to practice it against the engine.'
				: 'Fetch your recent games and analyze them locally — nothing leaves your browser.'}
		</p>

		<div class="site-picker">
			<button
				type="button"
				class="side"
				class:selected={source === 'chess.com'}
				onclick={() => pickSource('chess.com')}>Chess.com</button
			>
			<button
				type="button"
				class="side"
				class:selected={source === 'lichess'}
				onclick={() => pickSource('lichess')}>Lichess</button
			>
			<button
				type="button"
				class="side"
				class:selected={source === 'import'}
				onclick={() => pickSource('import')}>Import</button
			>
		</div>

		{#if source === 'import'}
			<div class="import">
				<textarea
					rows="4"
					placeholder="Paste a PGN game — or a FEN position to practice it against the engine"
					bind:value={importText}
				></textarea>
				<div class="row">
					<label class="btn btn-secondary file-btn">
						Open file…
						<input
							type="file"
							accept=".pgn,.txt,application/x-chess-pgn"
							onchange={onImportFile}
							hidden
						/>
					</label>
					<button class="btn" onclick={() => importGame(importText)} disabled={!importText.trim()}>
						Import
					</button>
				</div>
				{#if importError}
					<p class="error">{importError}</p>
				{/if}
			</div>
		{:else}
			<form
				class="fetch-form"
				onsubmit={(e) => {
					e.preventDefault();
					void submit();
				}}
			>
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
		{/if}

		{#if source !== 'import' && games}
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
			<div class="board-row">
				{#if report && shownEval}
					<EvalBar score={shownEval} {flipped} />
				{/if}
				<div class="board-wrap">
					<Board
						fen={shownFen}
						turnColor={shownTurn}
						orientation={flipped ? 'black' : 'white'}
						lastMove={shownLastMove}
						check={shownCheck}
						shapes={boardShapes}
					/>
				</div>
			</div>
			{#if report}
				<EvalGraph {report} shownPly={viewPly} onSelect={navTo} />
			{/if}
		</div>

		<aside class="panel">
			<button class="btn btn-secondary back" onclick={closeGame}>← Games</button>

			<div class="summary">
				{#each [{ p: current.white, chip: 'white' }, { p: current.black, chip: 'black' }] as { p, chip } (chip)}
					<div class="player">
						<span class="color-chip {chip}"></span>
						<span class="name">{p.name}</span>
						{#if p.rating}<span class="rating">({p.rating})</span>{/if}
						{#if p.name.toLowerCase() === username.trim().toLowerCase()}
							<span class="you">you</span>
						{/if}
					</div>
				{/each}
				<span class="meta">{current.result} · {current.speed}</span>
				{#if current.opening}
					<span class="meta opening-name">{current.opening}</span>
				{/if}
			</div>

			{#if report}
				<div class="accuracy">
					<div>
						<span class="color-chip white"></span>
						<span class="acc-label">{current.white.name}</span>
						<strong>{report.accuracy.white.toFixed(1)}%</strong>
					</div>
					<div>
						<span class="color-chip black"></span>
						<span class="acc-label">{current.black.name}</span>
						<strong>{report.accuracy.black.toFixed(1)}%</strong>
					</div>
				</div>

				<table class="counts">
					<tbody>
						{#each QUALITY_ROWS as row (row.key)}
							{@const w = report.counts.white[row.key] ?? 0}
							{@const b = report.counts.black[row.key] ?? 0}
							{#if w + b > 0}
								<tr class={row.key}>
									<td class="count">{w}</td>
									<td class="label"><span class="dot {row.key}"></span>{row.label}</td>
									<td class="count">{b}</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>

				<div class="verdict callout {viewedMove?.quality ?? ''}">
					{#if viewedMove}
						<strong>
							{plyLabel(viewedMove.ply)}
							{viewedMove.san}
						</strong>
						<span class="quality">{viewedMove.quality}</span>
						{#if bestWasSan}
							<button
								class="best-was"
								title="Show the position where {bestWasSan} was possible"
								onclick={() => {
									showEngineArrows = true;
									navTo(viewPly - 1);
								}}
							>
								best was {bestWasSan}
							</button>
						{/if}
					{:else}
						<strong>Start</strong>
					{/if}
					{#if shownEval}<span class="eval">{formatEval(shownEval)}</span>{/if}
				</div>

				{#if keyMoments.length > 0}
					<div class="moments" role="group" aria-label="Key moments">
						<button onclick={() => jumpMoment(-1)}>← mistake</button>
						<span>{keyMoments.length} key moments</span>
						<button onclick={() => jumpMoment(1)}>mistake →</button>
					</div>
				{/if}

				<label class="arrows-toggle">
					<input type="checkbox" bind:checked={showEngineArrows} />
					Show engine's best move
				</label>
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

			<button
				class="btn practice-btn"
				onclick={practiceFromHere}
				disabled={shownPositionOver}
				title="Play this position out against the engine"
			>
				♟ Practice from here as {shownTurn === 'white' ? 'White' : 'Black'}
			</button>

			<button
				class="btn btn-secondary practice-btn"
				onclick={openShare}
				title="Share this game as a link or PGN"
			>
				🔗 Share game
			</button>

			<div class="nav" role="group" aria-label="Move navigation">
				<button title="Start" onclick={() => navTo(0)} disabled={viewPly === 0}>⏮</button>
				<button title="Previous (←)" onclick={() => navTo(viewPly - 1)} disabled={viewPly === 0}>←</button>
				<button title="Next (→)" onclick={() => navTo(viewPly + 1)} disabled={viewPly >= moves.length}>→</button>
				<button title="End" onclick={() => navTo(moves.length)} disabled={viewPly >= moves.length}>⏭</button>
				<button title="Flip board" onclick={() => (flipped = !flipped)}>⇅</button>
			</div>

			<MoveList
				history={moves}
				{feedbackByPly}
				shownPly={viewPly}
				onSelect={navTo}
				{startColor}
				{startNumber}
			/>
		</aside>
	</div>
{/if}

<ShareDialog
	open={shareOpen}
	title="Share game"
	link={shareLink}
	pgn={current?.pgn ?? ''}
	filename={shareFilename}
	onclose={() => (shareOpen = false)}
/>

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
		margin-bottom: 0.75rem;
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

	.import {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.import textarea {
		background: var(--panel-raised);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.55rem 0.7rem;
		font: inherit;
		font-size: 0.85rem;
		resize: vertical;
	}

	.import .error {
		margin: 0;
	}

	.file-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
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

	.board-row {
		display: flex;
		gap: 0.5rem;
		align-items: stretch;
	}

	.board-wrap {
		flex: 1;
		min-width: 0;
	}

	.counts {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	.counts td {
		padding: 0.15rem 0.3rem;
	}

	.counts .count {
		width: 2.5rem;
		text-align: center;
		font-weight: 600;
	}

	.counts .label {
		text-align: center;
		color: var(--text-dim);
	}

	.counts .dot {
		display: inline-block;
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		margin-right: 0.4rem;
	}

	.dot.book { background: var(--q-book); }
	.dot.best { background: var(--accent); }
	.dot.excellent { background: var(--accent); }
	.dot.good { background: var(--q-good); }
	.dot.inaccuracy { background: var(--warn); }
	.dot.mistake { background: var(--q-mistake); }
	.dot.blunder { background: var(--danger); }

	.verdict {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.55rem 0.7rem;
		background: rgba(255, 255, 255, 0.04);
		border-left: 4px solid transparent;
		border-radius: 6px;
		font-size: 0.92rem;
	}

	.verdict .quality {
		text-transform: capitalize;
		color: var(--text-dim);
	}

	.verdict .best-was {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		color: #6ea8d8;
		text-decoration: underline;
	}

	.verdict .eval {
		margin-left: auto;
		font-weight: 600;
	}

	.verdict.inaccuracy {
		border-left-color: var(--warn);
		background: color-mix(in srgb, var(--warn) 14%, transparent);
	}

	.verdict.mistake {
		border-left-color: var(--q-mistake);
		background: color-mix(in srgb, var(--q-mistake) 16%, transparent);
	}

	.verdict.blunder {
		border-left-color: var(--danger);
		background: color-mix(in srgb, var(--danger) 18%, transparent);
	}

	.verdict.best,
	.verdict.excellent,
	.verdict.book,
	.verdict.good {
		border-left-color: var(--accent);
	}

	.moments {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
		color: var(--text-dim);
	}

	.moments button {
		flex: 1;
		background: var(--panel-raised);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.3rem 0;
		font-size: 0.82rem;
	}

	.moments span {
		white-space: nowrap;
	}

	.arrows-toggle {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0.45rem;
		font-size: 0.85rem;
		color: var(--text-dim);
		cursor: pointer;
	}

	.arrows-toggle input {
		margin: 0;
		width: 0.95rem;
		height: 0.95rem;
		flex: 0 0 auto;
		accent-color: var(--accent);
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
		font-size: 0.95rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.player {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-weight: 600;
		min-width: 0;
	}

	.player .name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.player .rating {
		color: var(--text-dim);
		font-weight: 400;
	}

	.player .you {
		background: var(--accent);
		color: #fff;
		border-radius: 999px;
		padding: 0 0.5rem;
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.color-chip {
		display: inline-block;
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 3px;
		flex-shrink: 0;
		border: 1px solid var(--border);
	}

	.color-chip.white {
		background: #ebecd2;
	}

	.color-chip.black {
		background: #33312e;
	}

	.opening-name {
		white-space: normal;
		overflow-wrap: break-word;
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

	.accuracy div {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
	}

	.acc-label {
		color: var(--text-dim);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.practice-btn {
		font-size: 0.9rem;
		padding: 0.5rem 0.8rem;
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
