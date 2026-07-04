<script lang="ts">
	import { base } from '$app/paths';
</script>

<section class="hero">
	<h1>Practice openings against a bot that plays the book.</h1>
	<p>
		Free, open-source chess training — pick an opening, set the difficulty, and get instant
		feedback on every move. Everything runs in your browser.
	</p>
	<a class="btn" href="{base}/train">Start training</a>
</section>

<style>
	.hero {
		max-width: 40rem;
		margin: 15vh auto 0;
		text-align: center;
	}

	h1 {
		font-size: 2rem;
	}

	p {
		color: var(--text-dim);
		margin-bottom: 2rem;
	}

	.btn {
		text-decoration: none;
		display: inline-block;
	}
</style>
