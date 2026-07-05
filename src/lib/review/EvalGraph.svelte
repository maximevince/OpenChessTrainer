<script lang="ts">
	import type { GameReport } from './analyse';
	import { winPct } from './accuracy';

	interface Props {
		report: GameReport;
		/** Number of plies currently shown on the board. */
		shownPly: number;
		onSelect: (ply: number) => void;
	}

	let { report, shownPly, onSelect }: Props = $props();

	const W = 100;
	const H = 40;

	/** x for position index i (0 = start position, i = after ply i). */
	const xs = $derived.by(() => {
		const n = report.evals.length - 1 || 1;
		return report.evals.map((_, i) => (i / n) * W);
	});

	/** y for White win% (0% bottom, 100% top). */
	const ys = $derived(report.evals.map((e) => H - (winPct(e) / 100) * H));

	const areaPath = $derived.by(() => {
		let d = `M 0 ${H}`;
		for (let i = 0; i < xs.length; i++) d += ` L ${xs[i].toFixed(2)} ${ys[i].toFixed(2)}`;
		return d + ` L ${W} ${H} Z`;
	});

	// Inline-style backgrounds on DOM spans, so CSS vars resolve fine here.
	const MARKER_FILL: Record<string, string> = {
		mistake: 'var(--q-mistake)',
		blunder: 'var(--danger)'
	};

	/** Key moments (mistakes/blunders) marked on the curve. */
	const markers = $derived(
		report.moves
			.filter((m) => MARKER_FILL[m.quality])
			.map((m) => ({ ply: m.ply, fill: MARKER_FILL[m.quality] }))
	);

	function pick(e: MouseEvent) {
		const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
		const frac = (e.clientX - rect.left) / rect.width;
		onSelect(Math.round(frac * (report.evals.length - 1)));
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions, a11y_no_noninteractive_element_interactions -->
<div class="graph">
	<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" onclick={pick} role="img" aria-label="Evaluation graph">
		<rect width={W} height={H} class="black-side" />
		<path d={areaPath} class="white-side" />
		<line x1="0" y1={H / 2} x2={W} y2={H / 2} class="mid" />
		{#if shownPly < report.evals.length}
			<line x1={xs[shownPly]} y1="0" x2={xs[shownPly]} y2={H} class="cursor" />
		{/if}
	</svg>
	<!-- HTML overlay dots: the svg is stretched (preserveAspectRatio none), so
	     circles drawn inside it would deform. Percent-positioned divs stay round. -->
	{#each markers as m (m.ply)}
		<span
			class="marker"
			style="left: {xs[m.ply + 1]}%; top: {(ys[m.ply + 1] / H) * 100}%; background: {m.fill}"
		></span>
	{/each}
</div>

<style>
	.graph {
		position: relative;
	}

	svg {
		width: 100%;
		height: 5rem;
		display: block;
		border-radius: 6px;
		cursor: pointer;
	}

	.black-side {
		fill: #3a3733;
	}

	.white-side {
		fill: #e8e6e3;
	}

	.mid {
		stroke: var(--accent);
		stroke-width: 0.3;
		opacity: 0.7;
	}

	.cursor {
		stroke: var(--accent);
		stroke-width: 0.6;
	}

	.marker {
		position: absolute;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		border: 1.5px solid #fff;
		transform: translate(-50%, -50%);
		pointer-events: none;
	}
</style>
