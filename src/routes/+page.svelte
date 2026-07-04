<script lang="ts">
	import { base } from '$app/paths';
	import { AUTHOR, AUTHOR_URL, BMC_URL, LICENSE_URL, REPO_URL, VERSION } from '$lib/About.svelte';
	import knight from '$lib/assets/favicon.svg';
</script>

<div class="splash">
	<div class="card">
		<img class="logo" src={knight} alt="" />

		<h1 class="name">OpenChessTrainer</h1>
		<p class="tag">Practice openings against a bot that plays the book.</p>

		<p class="desc">
			Pick an opening and learn to play it — or let the bot play its traps so you learn to punish
			them — with instant feedback on every move. Then fetch your own games from Chess.com or
			Lichess and review them with a local Stockfish. Free, open-source, and fully in your
			browser: no account, your games never leave your machine.
		</p>

		<a class="start" href="{base}/train">Start training →</a>

		<div class="bmc-row">
			<a class="bmc" href={BMC_URL} target="_blank" rel="noopener noreferrer">
				<span class="cup" aria-hidden="true">☕</span>
				<span>Buy me a coffee</span>
			</a>
		</div>

		<footer class="meta">
			<span>v{VERSION}</span>
			<span class="sep">·</span>
			<a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">GPL-3.0</a>
			<span class="sep">·</span>
			<span>by <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">{AUTHOR}</a></span>
			<span class="sep">·</span>
			<a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
		</footer>
	</div>
</div>

<style>
	.splash {
		display: grid;
		place-items: center;
		min-height: calc(100vh - 10rem);
		background: radial-gradient(120% 120% at 50% 0%, #33302c 0%, var(--chrome) 60%);
		border-radius: 12px;
	}

	.card {
		text-align: center;
		max-width: 560px;
		padding: 2rem;
	}

	.logo {
		width: 76px;
		height: 76px;
		margin-bottom: 1.1rem;
	}

	.name {
		margin: 0;
		font-size: 2.6rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		background: linear-gradient(180deg, #fff, #b9c4a8);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}

	.tag {
		margin: 0.4rem 0 0;
		font-weight: 600;
	}

	.desc {
		margin: 1.1rem auto 1.6rem;
		color: var(--text-dim);
		font-size: 0.92rem;
		line-height: 1.6;
		max-width: 470px;
	}

	.start {
		display: inline-block;
		background: var(--accent);
		color: #fff;
		text-decoration: none;
		border-radius: 10px;
		padding: 0.7rem 1.6rem;
		font-size: 1rem;
		font-weight: 700;
		transition: filter 0.1s ease;
	}

	.start:hover {
		filter: brightness(1.08);
	}

	.bmc-row {
		margin-top: 1.4rem;
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
	}

	.bmc:hover {
		transform: translateY(-1px);
	}

	.cup {
		font-size: 1.1rem;
	}

	.meta {
		margin-top: 1.8rem;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.78rem;
		color: var(--text-dim);
	}

	.meta a {
		color: var(--accent);
		text-decoration: none;
	}

	.meta a:hover {
		text-decoration: underline;
	}

	.meta .sep {
		opacity: 0.5;
	}
</style>
