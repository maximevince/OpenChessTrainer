<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import About, { REPO_URL, VERSION, GIT_SHA } from '$lib/About.svelte';

	let { children } = $props();
	let aboutOpen = $state(false);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>OpenChessTrainer</title>
</svelte:head>

<div class="app">
	<header>
		<a class="logo" href="{base}/">
			<span class="logo-mark">♞</span> OpenChessTrainer
		</a>
		<nav>
			<a href="{base}/train" class:active={page.url.pathname.startsWith(`${base}/train`)}>Train</a>
			<a href="{base}/review" class:active={page.url.pathname.startsWith(`${base}/review`)}>Review</a>
		</nav>
		<button
			class="iconbtn"
			title="About OpenChessTrainer"
			aria-label="About OpenChessTrainer"
			onclick={() => (aboutOpen = true)}>ⓘ</button
		>
	</header>
	<main>
		{@render children()}
	</main>
	<footer>
		v{VERSION} ·
		<a href="{REPO_URL}/commit/{GIT_SHA}" target="_blank" rel="noopener">{GIT_SHA}</a>
	</footer>
</div>

<About open={aboutOpen} onclose={() => (aboutOpen = false)} />

<style>
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		align-items: center;
		gap: 2rem;
		padding: 0.75rem 1.5rem;
		background: var(--panel);
		border-bottom: 1px solid var(--border);
	}

	.logo {
		font-weight: 700;
		font-size: 1.1rem;
		color: var(--text);
		text-decoration: none;
	}

	.logo-mark {
		color: var(--accent);
	}

	nav {
		display: flex;
		gap: 1.25rem;
	}

	nav a {
		color: var(--text-dim);
		text-decoration: none;
		font-weight: 600;
	}

	nav a:hover,
	nav a.active {
		color: var(--text);
	}

	nav a.active {
		color: var(--accent);
	}

	.iconbtn {
		margin-left: auto;
		background: transparent;
		border: none;
		color: var(--text-dim);
		font-size: 1.05rem;
		padding: 0.2rem 0.45rem;
		border-radius: 6px;
	}

	.iconbtn:hover {
		color: var(--text);
		background: var(--panel-raised);
	}

	main {
		flex: 1;
		padding: 1.5rem;
	}

	footer {
		padding: 0.5rem 1.5rem;
		text-align: center;
		font-size: 0.72rem;
		color: var(--text-dim);
		opacity: 0.6;
	}

	footer a {
		color: inherit;
	}
</style>
