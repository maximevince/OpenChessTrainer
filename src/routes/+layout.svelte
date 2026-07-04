<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { base } from '$app/paths';
	import { page } from '$app/state';

	let { children } = $props();
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
			<span class="disabled" title="Coming soon">Review</span>
		</nav>
	</header>
	<main>
		{@render children()}
	</main>
	<footer>
		v{__APP_VERSION__} ·
		<a
			href="https://github.com/maximevince/OpenChessTrainer/commit/{__GIT_SHA__}"
			target="_blank"
			rel="noopener">{__GIT_SHA__}</a
		>
	</footer>
</div>

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

	nav .disabled {
		color: var(--text-dim);
		opacity: 0.4;
		font-weight: 600;
		cursor: not-allowed;
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
