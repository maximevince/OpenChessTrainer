<script lang="ts" module>
	// App provenance + attribution, shared by the About dialog, splash and footer.
	export const REPO_URL = 'https://github.com/maximevince/OpenChessTrainer';
	export const LICENSE_URL = 'https://github.com/maximevince/OpenChessTrainer/blob/main/LICENSE';
	export const AUTHOR = 'Maxime Vincent';
	export const AUTHOR_URL = 'https://github.com/maximevince';
	export const BMC_URL = 'https://www.buymeacoffee.com/maximevince';
	export const VERSION = __APP_VERSION__;
	export const GIT_SHA = __GIT_SHA__;
	export const BUILD_DATE = __BUILD_DATE__;
</script>

<script lang="ts">
	let { open = false, onclose }: { open?: boolean; onclose: () => void } = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	// Drive the native <dialog> from the `open` prop so it gets the built-in modal
	// semantics (focus trap, Esc, inert background) for free.
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	const FEATURES = [
		{ name: 'Opening trainer', what: 'book bot, play or refute, per-move feedback' },
		{ name: 'Hints & take back', what: 'book/engine arrows, retry your mistakes' },
		{ name: 'Game review', what: 'Chess.com & Lichess import, local analysis' },
		{ name: 'Fully in-browser', what: 'no backend, your games never leave your machine' }
	];

	const LIBS = [
		{ name: 'Stockfish 18 (WASM NNUE)', what: 'engine, single-threaded lite build' },
		{ name: 'Chessground', what: 'lichess board UI + cburnett pieces' },
		{ name: 'chess.js', what: 'rules, PGN and FEN handling' },
		{ name: 'Lichess Opening Explorer', what: 'opening book statistics (CC0)' },
		{ name: 'Svelte 5 + SvelteKit', what: 'static SPA framework' }
	];
</script>

<dialog
	bind:this={dialog}
	class="about"
	{onclose}
	onclick={(e) => {
		// Click on the backdrop (the dialog element itself) closes it.
		if (e.target === dialog) onclose();
	}}
>
	{#if open}
		<div class="sheet">
			<header class="ab-head">
				<h2>♞ OpenChessTrainer</h2>
				<button class="x" aria-label="Close" onclick={onclose}>✕</button>
			</header>

			<p class="tagline">Free, open-source chess trainer that runs 100% in your browser.</p>
			<p class="purpose">
				Practice openings against a bot that plays the book — or plays the traps so you can learn
				to punish them — with instant feedback on every move. Fetch your own games from Chess.com
				or Lichess and review them with a local Stockfish: badges, accuracy and an eval graph.
			</p>

			<section>
				<h3>What it does</h3>
				<ul class="kv">
					{#each FEATURES as f (f.name)}
						<li><span class="k">{f.name}</span><span class="v">{f.what}</span></li>
					{/each}
				</ul>
			</section>

			<section>
				<h3>Built with</h3>
				<ul class="kv">
					{#each LIBS as l (l.name)}
						<li><span class="k">{l.name}</span><span class="v">{l.what}</span></li>
					{/each}
				</ul>
			</section>

			<a class="bmc" href={BMC_URL} target="_blank" rel="noopener noreferrer">
				<span class="cup" aria-hidden="true">☕</span>
				<span>Buy me a coffee</span>
			</a>

			<footer class="ab-foot">
				<div class="meta">
					<span class="ver">v{VERSION}</span>
					<a class="sha" href={`${REPO_URL}/commit/${GIT_SHA}`} target="_blank" rel="noopener noreferrer">{GIT_SHA}</a>
					<span class="dim">· {BUILD_DATE}</span>
				</div>
				<div class="links">
					<a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">GPL-3.0</a>
					<span class="dim">· by</span>
					<a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">{AUTHOR}</a>
					<a class="repo" href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub repo ↗</a>
				</div>
			</footer>
		</div>
	{/if}
</dialog>

<style>
	.about {
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 0;
		background: var(--panel);
		color: var(--text);
		max-width: 540px;
		width: calc(100vw - 2rem);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
	}

	.about::backdrop {
		background: rgba(20, 18, 16, 0.6);
		backdrop-filter: blur(2px);
	}

	.sheet {
		padding: 1.4rem 1.6rem 1.2rem;
	}

	.ab-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.ab-head h2 {
		margin: 0;
		font-size: 1.25rem;
	}

	.x {
		background: transparent;
		border: none;
		color: var(--text-dim);
		font-size: 1rem;
		padding: 0.2rem 0.4rem;
		border-radius: 6px;
	}

	.x:hover {
		color: var(--text);
		background: var(--chrome);
	}

	.tagline {
		margin: 0 0 0.6rem;
		font-weight: 600;
	}

	.purpose {
		margin: 0 0 1.1rem;
		color: var(--text-dim);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	section {
		margin-bottom: 1.1rem;
	}

	section h3 {
		margin: 0 0 0.4rem;
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--accent);
	}

	.kv {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.kv li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		font-size: 0.85rem;
	}

	.kv .k {
		color: var(--text);
	}

	.kv .v {
		color: var(--text-dim);
		text-align: right;
		font-size: 0.78rem;
	}

	.bmc {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: #ffdd00;
		color: #0d0c22;
		text-decoration: none;
		font-weight: 700;
		font-size: 0.9rem;
		padding: 0.5rem 1rem;
		border-radius: 10px;
		border: 1px solid rgba(0, 0, 0, 0.15);
		transition: transform 0.1s ease;
		margin-bottom: 1.1rem;
	}

	.bmc:hover {
		transform: translateY(-1px);
	}

	.cup {
		font-size: 1.1rem;
	}

	.ab-foot {
		border-top: 1px solid var(--border);
		padding-top: 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
	}

	.ver {
		color: var(--text);
	}

	.meta .sha {
		color: var(--accent);
	}

	.dim {
		color: var(--text-dim);
	}

	.links {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		font-size: 0.85rem;
	}

	.links a {
		color: var(--accent);
		text-decoration: none;
	}

	.links a:hover {
		text-decoration: underline;
	}

	.repo {
		margin-left: auto;
	}
</style>
