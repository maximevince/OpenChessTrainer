<script lang="ts">
	import 'chessground/assets/chessground.base.css';
	import 'chessground/assets/chessground.brown.css';
	import 'chessground/assets/chessground.cburnett.css';
	import './board-theme.css';
	import { untrack } from 'svelte';
	import { Chessground } from 'chessground';
	import type { Api } from 'chessground/api';
	import type { Config } from 'chessground/config';
	import type { DrawShape } from 'chessground/draw';
	import type { Key } from 'chessground/types';

	interface Props {
		fen: string;
		/** Side to move (chessground needs it to allow that side's pieces to be selected). */
		turnColor?: 'white' | 'black';
		orientation?: 'white' | 'black';
		/** Legal move map; omit (or pass undefined) to make the board view-only. */
		dests?: Map<Key, Key[]>;
		/** Which color the user may move; undefined disables moving. */
		movableColor?: 'white' | 'black';
		lastMove?: [Key, Key];
		check?: boolean;
		shapes?: DrawShape[];
		onUserMove?: (from: Key, to: Key) => void;
	}

	let {
		fen,
		turnColor = 'white',
		orientation = 'white',
		dests,
		movableColor,
		lastMove,
		check = false,
		shapes = [],
		onUserMove
	}: Props = $props();

	let el: HTMLElement;
	let cg: Api | undefined;

	function config(): Config {
		return {
			fen,
			turnColor,
			orientation,
			lastMove,
			check,
			animation: { enabled: true, duration: 150 },
			// Accept synthetic (non-isTrusted) events so automated e2e tests can move pieces.
			trustAllEvents: true,
			movable: {
				free: false,
				color: movableColor,
				dests: movableColor ? (dests ?? new Map()) : new Map(),
				showDests: true,
				events: { after: (orig, dest) => onUserMove?.(orig as Key, dest as Key) }
			},
			draggable: { showGhost: true },
			premovable: { enabled: false },
			drawable: { enabled: false, autoShapes: shapes }
		};
	}

	$effect(() => {
		cg = Chessground(el, untrack(config));
		return () => {
			cg?.destroy();
			cg = undefined;
		};
	});

	$effect(() => {
		cg?.set(config());
	});
</script>

<div class="board" bind:this={el}></div>

<style>
	.board {
		width: 100%;
		aspect-ratio: 1;
	}
</style>
