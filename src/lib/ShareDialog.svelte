<script lang="ts">
	/**
	 * Modal for sharing the current game/position: a self-contained link, or the
	 * PGN (copy / download). Tabbed like the review module's source picker.
	 */
	interface Props {
		open: boolean;
		title: string;
		/** Self-contained share URL (full state in the fragment). */
		link: string;
		pgn: string;
		/** Download name for the PGN file. */
		filename: string;
		onclose: () => void;
	}

	let { open, title, link, pgn, filename, onclose }: Props = $props();

	let el: HTMLDialogElement | undefined = $state();
	let tab = $state<'link' | 'pgn'>('link');
	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (!el) return;
		if (open && !el.open) {
			tab = 'link';
			copied = false;
			el.showModal();
		} else if (!open && el.open) {
			el.close();
		}
	});

	function pickTab(t: 'link' | 'pgn') {
		tab = t;
		copied = false;
	}

	async function copy(text: string) {
		await navigator.clipboard.writeText(text);
		copied = true;
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = false), 1500);
	}

	function download() {
		const url = URL.createObjectURL(new Blob([pgn + '\n'], { type: 'application/x-chess-pgn' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
</script>

<dialog
	bind:this={el}
	onclose={onclose}
	onclick={(e) => e.target === el && el.close()}
>
	<div class="body">
		<header>
			<h3>{title}</h3>
			<button class="close" onclick={() => el?.close()} aria-label="Close">×</button>
		</header>

		<div class="tabs">
			<button class="side" class:selected={tab === 'link'} onclick={() => pickTab('link')}>
				Share link
			</button>
			<button class="side" class:selected={tab === 'pgn'} onclick={() => pickTab('pgn')}>
				PGN
			</button>
		</div>

		{#if tab === 'link'}
			<p class="hint">
				The link contains the full game state — it works anywhere, no server involved.
			</p>
			<textarea readonly rows="4" value={link} onfocus={(e) => e.currentTarget.select()}></textarea>
			<div class="row">
				<button class="btn" onclick={() => copy(link)}>
					{copied ? '✓ Copied!' : '📋 Copy link'}
				</button>
			</div>
		{:else}
			<textarea readonly rows="10" value={pgn} onfocus={(e) => e.currentTarget.select()}></textarea>
			<div class="row">
				<button class="btn" onclick={() => copy(pgn)}>
					{copied ? '✓ Copied!' : '📋 Copy PGN'}
				</button>
				<button class="btn btn-secondary" onclick={download} title="Save as {filename}">
					⬇ Download
				</button>
			</div>
		{/if}
	</div>
</dialog>

<style>
	dialog {
		background: var(--panel);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0;
		width: min(30rem, calc(100vw - 2rem));
	}

	dialog::backdrop {
		background: rgba(0, 0, 0, 0.55);
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	h3 {
		margin: 0;
		font-size: 1.05rem;
	}

	.close {
		background: none;
		border: none;
		color: var(--text-dim);
		font-size: 1.3rem;
		line-height: 1;
		padding: 0 0.2rem;
		cursor: pointer;
	}

	.close:hover {
		color: var(--text);
	}

	.tabs {
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

	.hint {
		margin: 0;
		color: var(--text-dim);
		font-size: 0.82rem;
	}

	textarea {
		background: var(--panel-raised);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.55rem 0.7rem;
		font-family: ui-monospace, monospace;
		font-size: 0.78rem;
		line-height: 1.4;
		word-break: break-all;
		resize: vertical;
		width: 100%;
		box-sizing: border-box;
	}

	.row {
		display: flex;
		gap: 0.5rem;
	}

	.row .btn {
		flex: 1;
	}
</style>
