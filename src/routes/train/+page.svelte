<script lang="ts">
	import Board from '$lib/board/Board.svelte';
	import EvalBar from '$lib/board/EvalBar.svelte';
	import GameOverOverlay from '$lib/board/GameOverOverlay.svelte';
	import { engine } from '$lib/engine/engine';
	import { terminalEval } from '$lib/terminal';
	import type { EvalScore } from '$lib/engine/uci';
	import { Trainer, type FeedbackBadge, type FeedbackItem } from '$lib/trainer/trainer.svelte';
	import type { LineStep } from '$lib/trainer/explain';
	import FeedbackPanel from '$lib/trainer/FeedbackPanel.svelte';
	import ForkPanel from '$lib/trainer/ForkPanel.svelte';
	import MoveList from '$lib/trainer/MoveList.svelte';
	import { loadIndex } from '$lib/openings/tree';
	import { resolvePinnedMove } from '$lib/openings/pinning';
	import { MIN_ELO, MAX_ELO, UCI_ELO_FLOOR } from '$lib/engine/engine';
	import type { OpeningIndexEntry, OpeningVariation } from '$lib/openings/types';
	import type { DrawShape } from 'chessground/draw';
	import type { Key } from 'chessground/types';
	import { positionAt, isTypingTarget, type BrowsePosition } from '$lib/browse';
	import { pgnDate, fileStamp } from '$lib/date';
	import { VERDICT_GLYPH } from '$lib/verdict';
	import { getPractice, clearPractice } from '$lib/practice';
	import { movesToPgn, pgnToMoves } from '$lib/pgn';
	import { setReviewRequest } from '$lib/review/handoff';
	import { decodeShare, encodeShare } from '$lib/share';
	import ShareDialog from '$lib/ShareDialog.svelte';
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { goto, replaceState } from '$app/navigation';
	import { Chess } from 'chess.js';
	import type { PlayedMove } from '$lib/game.svelte';

	const trainer = new Trainer();

	/** True when the session's strength came from a shared link (don't clobber it from storage). */
	let sharedElo = false;

	// Arriving from review with a "practice from here" request: start immediately.
	const practiceRequest = getPractice();
	if (practiceRequest) {
		trainer.practice = practiceRequest;
		void trainer.start();
	} else if (browser && location.hash.length > 1) {
		// Shared link: the whole practice state lives in the URL fragment.
		void startShared(location.hash);
	}

	async function startShared(fragment: string) {
		const shared = await decodeShare(fragment);
		if (shared?.kind !== 'practice') return;
		let moves: PlayedMove[] = [];
		try {
			new Chess(shared.fen); // reject an invalid position before it reaches the game
			moves = shared.pgn ? pgnToMoves(shared.pgn) : [];
		} catch {
			return;
		}
		// A prelude that doesn't lead to the position would corrupt browsing — drop it.
		if (moves.length > 0 && moves.at(-1)?.fenAfter !== shared.fen) moves = [];
		if (typeof shared.elo === 'number') {
			trainer.elo = Math.max(MIN_ELO, Math.min(MAX_ELO, Math.round(shared.elo)));
			sharedElo = true;
		}
		trainer.practice = { fen: shared.fen, label: shared.label ?? 'Shared position', moves };
		await trainer.start();
		trainer.feedback = restoreSharedFeedback(shared.feedback, moves.length);
	}

	// --- Share dialog (link + PGN copy/download) ---
	let shareOpen = $state(false);
	let shareLink = $state('');
	let sharePgn = $state('');
	let shareFilename = $state('training.pgn');

	/** Build both share payloads and open the dialog; mirrors the link in the address bar. */
	async function openShare() {
		const p = trainer.practice;
		// Practice: share the position being drilled. Otherwise: share the live
		// position with the game so far as its prelude.
		const share = p
			? {
					kind: 'practice' as const,
					fen: p.fen,
					label: p.label,
					...(p.moves?.length ? { pgn: movesToPgn(p.moves.map((m) => ({ ...m }))) } : {}),
					elo: trainer.elo,
					...(plainFeedback(p.moves?.length ?? 0).length
						? { feedback: plainFeedback(p.moves?.length ?? 0) }
						: {})
				}
			: {
					kind: 'practice' as const,
					fen: game.fen,
					label: trainer.opening ? `${trainer.opening.name} training` : 'Training position',
					...(game.history.length ? { pgn: movesToPgn(plainHistory()) } : {}),
					elo: trainer.elo,
					...(plainFeedback(game.history.length).length ? { feedback: plainFeedback(game.history.length) } : {})
				};
		const fragment = await encodeShare(share);
		replaceState(fragment, {});
		shareLink = `${location.origin}${base}/train${fragment}`;
		sharePgn = movesToPgn(plainHistory(), trainingHeaders());
		shareFilename = `training-${fileStamp(new Date())}.pgn`;
		shareOpen = true;
	}

	function leavePractice() {
		clearPractice();
		trainer.exitPractice();
		// A shared-link fragment describes the practice we just left — drop it.
		if (location.hash) replaceState(location.pathname + location.search, {});
	}

	let openings = $state<OpeningIndexEntry[]>([]);
	let selectedOpening = $state<string>('');
	/** Name of the pinned named variation in setup, '' = sample the whole book. */
	let selectedVariation = $state<string>('');
	/** Draw an arrow for every book branch at the current position. */
	let showBranches = $state(false);
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
		if (typeof stored.elo === 'number' && !sharedElo) trainer.elo = stored.elo;
		if (typeof stored.showEval === 'boolean') showEval = stored.showEval;
		if (typeof stored.variability === 'number') trainer.variability = stored.variability;
		if (typeof stored.showSuggestions === 'boolean') trainer.showSuggestions = stored.showSuggestions;
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
		const wantVariation = typeof stored.variation === 'string' ? stored.variation : '';
		if (openingId) {
			// Restore the pinned variation once the tree (with its variations) has loaded.
			void pickOpening(openingId).then(() => {
				if (wantVariation) pickVariation(wantVariation);
			});
		}
		settingsLoaded = true;
	}

	$effect(() => {
		const settings = {
			opening: selectedOpening,
			variation: selectedVariation,
			mode: trainer.mode,
			manualSide: trainer.manualSide,
			elo: trainer.elo,
			variability: trainer.variability,
			showSuggestions: trainer.showSuggestions,
			showEval
		};
		if (settingsLoaded) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
	});

	const game = trainer.game;
	const userTurn = $derived(trainer.phase === 'userTurn');
	/** Setup (pick opening/settings) appears only after an explicit end-session action. */
	const inSetup = $derived(trainer.phase === 'idle');
	const postGame = $derived(trainer.phase === 'gameOver');

	const feedbackByPly = $derived(new Map<number, FeedbackItem>(trainer.feedback.map((f) => [f.ply, f])));

	// --- View-only navigation through played moves (game state untouched) ---
	/** Number of plies shown; null = live position. */
	let viewPly = $state<number | null>(null);

	// --- Engine-line excursion: read-only side-trip through a suggested line ---
	/** Active when the user clicked a move in the "why" panel; the board then
	 * shows the engine line instead of the game until they step or click out. */
	let excursion = $state<{
		line: 'best' | 'refutation';
		/** Ply of the flagged move the line explains. */
		sourcePly: number;
		steps: LineStep[];
		/** Plies of the line shown (0 = the position the line starts from). */
		step: number;
	} | null>(null);

	// Snap back to live whenever a move is played or a game starts/rewinds.
	$effect(() => {
		game.history.length;
		viewPly = null;
		excursion = null;
	});

	const shownPly = $derived(viewPly ?? game.history.length);
	const viewingLive = $derived(shownPly >= game.history.length && !excursion);
	// Excursion: derive from the engine line (LineStep is browsable like PlayedMove).
	// Live: read the reactive game (correct even before any move / for a practice FEN).
	// Browsing: derive from the history at the shown ply (shared with the review page).
	const shown = $derived<BrowsePosition>(
		excursion
			? positionAt(excursion.steps, excursion.step)
			: viewingLive
				? { fen: game.fen, lastMove: game.lastMove, check: game.inCheck, turn: game.turn }
				: positionAt(game.history, shownPly)
	);
	const shownFen = $derived(shown.fen);
	const shownLastMove = $derived(shown.lastMove);
	const shownCheck = $derived(shown.check);
	const shownTurn = $derived(shown.turn);
	/** Feedback for the move currently on the board (not necessarily the last one).
	 * During an excursion: the flagged move the line belongs to, so the "why"
	 * panel keeps its context while the board walks the line. */
	const shownFeedback = $derived(
		excursion
			? (feedbackByPly.get(excursion.sourcePly) ?? null)
			: viewingLive
				? trainer.lastFeedback
				: (feedbackByPly.get(shownPly - 1) ?? null)
	);

	/** Enter (or re-position) an excursion at `step` plies into the line. */
	function enterExcursion(line: 'best' | 'refutation', step: number) {
		const f = shownFeedback;
		if (!f?.explain) return;
		const steps = line === 'best' ? f.explain.bestLine : f.explain.refutation;
		if (steps.length === 0) return;
		// Plain copies: feedback lives in $state, and proxies shouldn't leak here.
		excursion = {
			line,
			sourcePly: f.ply,
			steps: steps.map((s) => ({ ...s })),
			step: Math.max(0, Math.min(step, steps.length))
		};
	}

	/** Leave the excursion: back to the frame the line branched from, or to live. */
	function exitExcursion(toLive = false) {
		if (!excursion) return;
		// The refutation starts after the flagged move; the best line replaces it.
		const branchFrame = excursion.sourcePly + (excursion.line === 'refutation' ? 1 : 0);
		excursion = null;
		navTo(toLive ? game.history.length : branchFrame);
	}

	// --- Live engine eval of the shown position (toggleable, like review) ---
	let showEval = $state(false);
	let liveEval = $state<EvalScore | null>(null);
	/** Incremented per eval request; stale responses check it and bail. */
	let evalToken = 0;

	$effect(() => {
		const fen = shownFen;
		const token = ++evalToken;
		if (!showEval) {
			liveEval = null;
			return;
		}
		// Mate/stalemate: grade without the engine (it can't eval terminal positions).
		const terminal = terminalEval(fen);
		if (terminal) {
			liveEval = terminal;
			return;
		}
		// Debounce so rapid move-list browsing doesn't flood the engine queue.
		const timer = setTimeout(async () => {
			const result = await engine.evaluate(fen, { movetimeMs: 400 });
			if (token === evalToken) liveEval = result;
		}, 150);
		return () => clearTimeout(timer);
	});

	function navTo(ply: number) {
		const clamped = Math.max(0, Math.min(ply, game.history.length));
		viewPly = clamped >= game.history.length ? null : clamped;
	}

	function onKeydown(e: KeyboardEvent) {
		if (isTypingTarget(e)) return;
		// Inside an excursion the arrows walk the engine line, not the game.
		if (excursion) {
			if (e.key === 'ArrowLeft') {
				if (excursion.step > 0) excursion.step--;
				else exitExcursion();
				e.preventDefault();
			} else if (e.key === 'ArrowRight') {
				excursion.step = Math.min(excursion.step + 1, excursion.steps.length);
				e.preventDefault();
			} else if (e.key === 'Escape') {
				exitExcursion(true);
				e.preventDefault();
			}
			return;
		}
		if (e.key === 'ArrowLeft') {
			navTo(shownPly - 1);
			e.preventDefault();
		} else if (e.key === 'ArrowRight') {
			navTo(shownPly + 1);
			e.preventDefault();
		} else if (e.key === 's') {
			trainer.showSuggestions = !trainer.showSuggestions;
			e.preventDefault();
		}
	}

	const summary = $derived.by(() => {
		if (trainer.practice) return `Practicing as ${trainer.userSide} — ${trainer.practice.label}`;
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
		const f = shownFeedback;
		if (!f) return [];
		const glyph = VERDICT_GLYPH[f.badge];
		const m = game.history[f.ply];
		if (!glyph || !m) return [];
		const orig = m.uci.slice(0, 2) as Key;
		const dest = m.uci.slice(2, 4) as Key;
		// On the move's own frame the mover's piece still sits on `dest`, so badge it there.
		if (f.ply === shownPly - 1) return [{ orig: dest, label: glyph }];
		// Live, once the bot has replied (often a recapture landing on `dest`), a badge on
		// `dest` would sit on the bot's piece and read as the bot blundering. Keep the
		// verdict visible instead by drawing the flagged move as a red arrow, with the glyph
		// on the now-vacated origin square so it clearly refers to your move.
		return [
			{ orig, dest, brush: 'red' },
			{ orig, label: glyph }
		];
	});

	const uciArrow = (uci: string, brush: string): DrawShape => ({
		orig: uci.slice(0, 2) as Key,
		dest: uci.slice(2, 4) as Key,
		brush
	});

	// "Why" arrows for a flagged move. On the frame right after it (including live
	// while the bot is still thinking): the opponent's strongest reply in yellow.
	// One frame earlier (browsing back): the played move in red against the
	// engine's best in blue, i.e. "instead of this, play that".
	const explainShapes = $derived.by<DrawShape[]>(() => {
		const shapes: DrawShape[] = [];
		const f = shownFeedback;
		if (f?.explain?.refutationUci && f.ply === shownPly - 1) {
			shapes.push(uciArrow(f.explain.refutationUci, 'yellow'));
		}
		const next = feedbackByPly.get(shownPly);
		const m = next?.explain?.bestUci ? game.history[next.ply] : undefined;
		if (next?.explain?.bestUci && m) {
			shapes.push(uciArrow(m.uci, 'red'), uciArrow(next.explain.bestUci, 'blue'));
		}
		return shapes;
	});

	// Excursion: the line's next move as a blue arrow, so stepping never surprises.
	const excursionShapes = $derived.by<DrawShape[]>(() => {
		const next = excursion?.steps[excursion.step];
		return next ? [uciArrow(next.uci, 'blue')] : [];
	});

	// One arrow per book branch at the live position: green=main, red=trap,
	// blue=pinned continuation, yellow=other sideline. Only when the user opts in.
	const forkShapes = $derived.by<DrawShape[]>(() => {
		if (!showBranches || !trainer.showSuggestions) return [];
		const node = trainer.currentBookNode();
		if (!node || node.children.length < 2) return [];
		const maxWeight = Math.max(...node.children.map((c) => c.weight));
		const pinnedUci = resolvePinnedMove(trainer.pinnedLine, game.uciMoves, node)?.uci ?? null;
		return node.children.map((c) => ({
			orig: c.uci.slice(0, 2) as Key,
			dest: c.uci.slice(2, 4) as Key,
			brush:
				c.uci === pinnedUci
					? 'blue'
					: c.trap
						? 'red'
						: c.weight === maxWeight
							? 'green'
							: 'yellow'
		}));
	});

	const resultText = $derived.by(() => {
		const r = game.result;
		if (!r) return null;
		if (r.winner === null) return `Draw — ${r.reason}`;
		return `${r.winner === trainer.userSide ? 'You win' : 'You lose'} — ${r.reason}`;
	});

	function isFeedbackBadge(value: unknown): value is FeedbackBadge {
		return (
			value === 'book-best' ||
			value === 'book' ||
			value === 'trap' ||
			value === 'best' ||
			value === 'excellent' ||
			value === 'good' ||
			value === 'inaccuracy' ||
			value === 'mistake' ||
			value === 'blunder' ||
			value === 'pending'
		);
	}

	function restoreSharedFeedback(value: unknown, maxPlies: number): FeedbackItem[] {
		if (!Array.isArray(value)) return [];
		const feedback: FeedbackItem[] = [];
		for (const item of value) {
			if (!item || typeof item !== 'object') continue;
			const f = item as Record<string, unknown>;
			if (
				typeof f.ply !== 'number' ||
				f.ply < 0 ||
				f.ply >= maxPlies ||
				typeof f.label !== 'string' ||
				typeof f.san !== 'string' ||
				!isFeedbackBadge(f.badge)
			) {
				continue;
			}
			feedback.push({
				ply: f.ply,
				label: f.label,
				san: f.san,
				badge: f.badge,
				...(typeof f.detail === 'string' ? { detail: f.detail } : {}),
				...(typeof f.retriable === 'boolean' ? { retriable: f.retriable } : {}),
				...(f.explain && typeof f.explain === 'object' ? { explain: f.explain as FeedbackItem['explain'] } : {})
			});
		}
		return feedback;
	}

	async function pickOpening(id: string) {
		selectedOpening = id;
		selectedVariation = ''; // selectOpening clears any pin; keep the UI in sync
		await trainer.selectOpening(id || null);
	}

	/** Variations bucketed for the picker: ungrouped first, then one optgroup
	 * per `group` in first-appearance order. */
	const variationGroups = $derived.by(() => {
		const ungrouped: OpeningVariation[] = [];
		const groups = new Map<string, OpeningVariation[]>();
		for (const v of trainer.opening?.variations ?? []) {
			if (!v.group) {
				ungrouped.push(v);
				continue;
			}
			const bucket = groups.get(v.group);
			if (bucket) bucket.push(v);
			else groups.set(v.group, [v]);
		}
		return { ungrouped, grouped: [...groups] };
	});

	/** Setup: pin a named variation by name (''/unknown → sample the whole book). */
	function pickVariation(name: string) {
		const v = trainer.opening?.variations?.find((x) => x.name === name);
		if (v) {
			trainer.pinVariation(v);
			selectedVariation = name;
		} else {
			trainer.clearPin();
			selectedVariation = '';
		}
	}

	// --- Export / transfer to review ---

	/** Full history as plain objects (history is a $state deep proxy). Includes a
	 * practice prelude, so exports/reviews are the complete game from move one. */
	const plainHistory = () => game.history.map((m) => ({ ...m }));

	const plainFeedback = (maxPlies: number) =>
		trainer.feedback.filter((f) => f.ply < maxPlies).map((f) => ({
			...f,
			...(f.explain
				? {
						explain: {
							...f.explain,
							bestLine: f.explain.bestLine.map((m) => ({ ...m })),
							refutation: f.explain.refutation.map((m) => ({ ...m }))
						}
					}
				: {})
		}));

	const pgnResult = $derived.by(() => {
		const r = game.result;
		if (!r) return '*';
		return r.winner === null ? '1/2-1/2' : r.winner === 'white' ? '1-0' : '0-1';
	});

	function trainingHeaders(): Record<string, string> {
		const bot = `Stockfish (Elo ${trainer.elo})`;
		const opening = trainer.practice ? trainer.practice.label : trainer.opening?.name;
		return {
			Event: 'OpenChessTrainer training game',
			Site: 'OpenChessTrainer',
			Date: pgnDate(new Date()),
			White: trainer.userSide === 'white' ? 'You' : bot,
			Black: trainer.userSide === 'black' ? 'You' : bot,
			Result: pgnResult,
			...(opening ? { Opening: opening } : {})
		};
	}

	function sendToReview() {
		const moves = plainHistory();
		if (moves.length === 0) return;
		const headers = trainingHeaders();
		setReviewRequest({
			game: {
				white: { name: headers.White },
				black: { name: headers.Black },
				result: headers.Result === '1/2-1/2' ? '½-½' : (headers.Result as '1-0' | '0-1' | '*'),
				speed: 'training',
				opening: headers.Opening,
				pgn: movesToPgn(moves, headers)
			},
			moves,
			orientation: trainer.userSide
		});
		trainer.endSession(); // cancel in-flight bot replies/evals before leaving
		void goto(`${base}/review`);
	}

	function onUserMove(from: string, to: string) {
		trainer.onUserMove(from, to);
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="train">
	<div class="board-col">
		<div class="board-row">
			{#if showEval}
				<!-- Mounts with the toggle, not with the first eval result, so the
				     board doesn't shift sideways when the engine answers. -->
				<EvalBar score={liveEval} flipped={trainer.userSide === 'black'} />
			{/if}
			<div class="board-wrap" class:excursion={!!excursion}>
				<Board
					fen={shownFen}
					turnColor={shownTurn}
					orientation={trainer.userSide}
					dests={game.dests}
					movableColor={viewingLive && userTurn ? trainer.userSide : undefined}
					lastMove={shownLastMove}
					check={shownCheck}
					shapes={excursion
						? excursionShapes
						: viewingLive
							? [...hintShapes, ...verdictShapes, ...forkShapes, ...explainShapes]
							: [...verdictShapes, ...explainShapes]}
					{onUserMove}
				/>
				{#if viewingLive && game.result}
					<GameOverOverlay result={game.result} pov={trainer.userSide} />
				{/if}
			</div>
		</div>
		{#if excursion}
			<div class="browse-note excursion-note">
				Engine line — move {excursion.step} of {excursion.steps.length} (← → to step, Esc to leave)
				<button class="link" onclick={() => exitExcursion(true)}>Back to game</button>
			</div>
		{:else if !viewingLive}
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

		{#if inSetup && trainer.practice}
			<h2>Practice position</h2>
			<p class="practice-note">{trainer.practice.label} — you play {trainer.userSide}.</p>

			<label class="field">
				<span>Strength: <strong>{strengthLabel}</strong></span>
				<input type="range" min={MIN_ELO} max={MAX_ELO} step="50" bind:value={trainer.elo} />
			</label>

			<button class="btn" onclick={() => trainer.start()}>
				{game.history.length > 0 ? 'Retry position' : 'Start'}
			</button>
			<button class="btn btn-secondary" onclick={openShare} title="Share this position as a link or PGN">
				🔗 Share position
			</button>
			<button class="btn btn-secondary" onclick={leavePractice}>Leave practice</button>
		{:else if inSetup}
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

			{#if trainer.opening?.variations?.length}
				<label class="field">
					<span>Variation</span>
					<select
						value={selectedVariation}
						onchange={(e) => pickVariation(e.currentTarget.value)}
					>
						<option value="">Any (sample the book)</option>
						{#each variationGroups.ungrouped as v (v.name)}
							<option value={v.name}>{v.trap ? '⚠ ' : ''}{v.name}</option>
						{/each}
						{#each variationGroups.grouped as [group, vars] (group)}
							<optgroup label={group}>
								{#each vars as v (v.name)}
									<option value={v.name}>{v.trap ? '⚠ ' : ''}{v.name}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
					<small>
						{#if selectedVariation}
							{@const intro = trainer.opening.variations.find((v) => v.name === selectedVariation)?.intro}
							{#if intro}{intro}
							{:else}The bot follows this exact line; variability is ignored while on it.{/if}
						{:else}
							Pick a specific line to drill, or leave on Any to sample the whole book.
						{/if}
					</small>
				</label>
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
				New Game
			</button>
		{:else}
			<!-- Playing/post-game: a fixed-order, fixed-size control cluster first,
			     so click targets never move; variable-height content renders below it. -->
			<div class="summary">
				{summary} <span class="elo">· Elo {trainer.elo}</span>
			</div>

			<p class="status">
				{postGame ? 'Game over' : trainer.phase === 'botThinking' ? 'Thinking…' : 'Your move'}
			</p>

			<div class="actions" role="group" aria-label="Move actions">
				{#if !postGame}
					<button
						class="btn btn-secondary"
						onclick={() => trainer.showHint()}
						disabled={trainer.phase !== 'userTurn' || trainer.hintLoading}
					>
						{trainer.hintLoading ? 'Hint…' : 'Hint'}
					</button>
				{/if}
				<button
					class="btn {trainer.retrySuggested ? 'retry' : 'btn-secondary'}"
					onclick={() => trainer.takeBack()}
					disabled={!trainer.canTakeBack}
				>
					{trainer.retrySuggested ? 'Undo & retry' : 'Take back'}
				</button>
				{#if postGame}
					<button class="btn" onclick={() => trainer.start()}>
						{trainer.practice ? 'Retry position' : 'New game'}
					</button>
				{/if}
			</div>

			{@render navButtons()}

			{@render evalToggle()}

			{#if !postGame && trainer.opening && !trainer.practice}
				<label class="branches-toggle">
					<input
						type="checkbox"
						bind:checked={showBranches}
						disabled={!trainer.inBook || !trainer.showSuggestions}
					/>
					Show all branches as arrows
				</label>
			{/if}

			<button class="btn btn-secondary" onclick={() => trainer.endSession()}>
				{postGame ? 'End session' : 'End game'}
			</button>

			{#if trainer.opening && !trainer.inBook && !trainer.practice}
				<div class="chip" class:done={trainer.bookExhausted}>
					{#if trainer.bookExhausted}
						✓ Book line complete — engine (Elo {trainer.elo}) takes over
					{:else}
						Out of book — engine (Elo {trainer.elo}) takes over
					{/if}
				</div>
			{/if}

			{#if trainer.pinnedLine && trainer.inBook}
				<div class="chip" class:pinned-on={trainer.onPinnedLine} class:done={trainer.pinnedComplete}>
					{#if trainer.pinnedComplete}
						✓ Line complete: {trainer.pinnedName ?? 'pinned line'} — bot resumes book sampling
					{:else if trainer.onPinnedLine}
						Pinned: {trainer.pinnedName ?? 'chosen line'}
					{:else}
						Off the pinned line — bot is improvising
					{/if}
				</div>
			{/if}

			<FeedbackPanel
				{trainer}
				feedback={shownFeedback}
				onPreview={enterExcursion}
				preview={excursion ? { line: excursion.line, step: excursion.step } : null}
			/>

			{#if !postGame}
				<ForkPanel {trainer} />
			{/if}

			{#if trainer.practice}
				<button class="btn btn-secondary" onclick={openShare} title="Share this position as a link or PGN">
					🔗 Share position
				</button>
			{/if}

			{@render moveHistory(true)}
			{@render exportRow()}
		{/if}

		{#if inSetup}
			{@render evalToggle()}

			{#if game.history.length > 0}
				{@render navButtons()}
				{@render moveHistory(false)}
				{@render exportRow()}
			{/if}
		{/if}

		{#snippet evalToggle()}
			<label class="eval-toggle">
				<input type="checkbox" bind:checked={showEval} />
				<span>Show engine eval</span>
			</label>
		{/snippet}

		{#snippet navButtons()}
			<div class="nav" role="group" aria-label="Move navigation">
				<button title="First move" onclick={() => navTo(0)} disabled={shownPly === 0}>⏮</button>
				<button title="Previous move (←)" onclick={() => navTo(shownPly - 1)} disabled={shownPly === 0}>←</button>
				<button title="Next move (→)" onclick={() => navTo(shownPly + 1)} disabled={viewingLive}>→</button>
				<button title="Back to live" onclick={() => navTo(game.history.length)} disabled={viewingLive}>⏭</button>
			</div>
		{/snippet}

		{#snippet moveHistory(fixed: boolean)}
			<MoveList
				history={game.history}
				{feedbackByPly}
				{shownPly}
				onSelect={navTo}
				startColor={game.initialTurn}
				startNumber={game.initialMoveNumber}
				{fixed}
			/>
		{/snippet}

		{#snippet exportRow()}
			<div class="export-row" role="group" aria-label="Game export">
				{#if !trainer.practice}
					<button class="btn btn-secondary" onclick={openShare} title="Share this game as a link or PGN">
						🔗 Share
					</button>
				{/if}
				<button
					class="btn btn-secondary"
					onclick={sendToReview}
					disabled={game.history.length === 0}
					title="Analyse this game in the review module"
				>
					🔍 Review game
				</button>
			</div>
		{/snippet}
	</aside>
</div>

<ShareDialog
	open={shareOpen}
	title={trainer.practice ? 'Share position' : 'Share game'}
	link={shareLink}
	pgn={sharePgn}
	filename={shareFilename}
	onclose={() => (shareOpen = false)}
/>

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

	.board-row {
		display: flex;
		gap: 0.5rem;
		align-items: stretch;
	}

	.board-wrap {
		flex: 1;
		min-width: 0;
		position: relative;
	}

	/* Engine-line excursion: tint the board edge so it never reads as the game. */
	.board-wrap.excursion {
		outline: 3px solid #6ea8d8;
		outline-offset: -1px;
	}

	.eval-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--text-dim);
		font-size: 0.9rem;
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

	/* A completed line is success, not a warning. */
	.chip.done {
		background: color-mix(in srgb, var(--accent) 16%, var(--panel-raised));
		border-color: var(--accent);
	}

	/* A pin that's being followed reads as calm/accent; the default warn tint
	 * (out-of-book, and the "off the pinned line" state) signals attention. */
	.chip.pinned-on {
		background: color-mix(in srgb, var(--accent) 16%, var(--panel-raised));
		border-color: var(--accent);
	}

	.branches-toggle {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.82rem;
		color: var(--text-dim);
	}

	.status {
		margin: 0;
		color: var(--text-dim);
		font-style: italic;
		font-size: 0.9rem;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.actions .btn {
		flex: 1;
	}

	.retry {
		background: var(--warn);
		color: #222;
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

	.practice-note {
		margin: 0;
		color: var(--text-dim);
		font-size: 0.9rem;
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

	/* Match the excursion board tint so the note reads as part of the same mode. */
	.excursion-note {
		color: #6ea8d8;
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

	.export-row {
		display: flex;
		gap: 0.5rem;
	}

	.export-row button {
		flex: 1;
		font-size: 0.85rem;
		padding: 0.4rem 0;
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
