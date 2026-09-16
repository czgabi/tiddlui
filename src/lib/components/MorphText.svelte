<script lang="ts">
	// Text that changes in place blurs from one value straight into the next.
	//
	// Both states are on screen for the whole swap: the outgoing one only starts
	// leaving once the incoming one is already visible. Anything else leaves a
	// frame or two with nothing on screen, which reads as a flicker rather than
	// a morph. A custom transition is used instead of svelte/transition's blur
	// so the opacity curve can be shaped independently of the blur.
	import { motionReduced } from '$lib/motion';

	let {
		value,
		duration = 100,
		class: klass = ''
	}: { value: string | number; duration?: number; class?: string } = $props();

	/** Arriving: sharpen and fade up quickly, reaching full opacity early. */
	function morphIn(_node: Element, { duration: d }: { duration: number }) {
		return {
			duration: d,
			css: (t: number) => {
				const eased = t * (2 - t); // ease-out
				return `opacity:${Math.min(1, eased * 1.6)};filter:blur(${(1 - eased) * 3}px);`;
			}
		};
	}

	/** Leaving: hold opacity, then drop away over the tail of the swap. */
	function morphOut(_node: Element, { duration: d }: { duration: number }) {
		return {
			duration: d,
			css: (t: number) => `opacity:${Math.max(0, t * t)};filter:blur(${(1 - t) * 3}px);`
		};
	}

	// The box is sized by a hidden copy of the text. Sizing it on the new value
	// alone resnaps the width the instant the value changes, before the new text
	// has faded in — visible on a w-fit select trigger as the button resizing
	// while it still shows the old label, which then overflows it. Holding the
	// outgoing value in the sizer for the length of the swap keeps the box at
	// the wider of the two until both texts have finished moving.
	let outgoing = $state<string | number | null>(null);
	let previous: string | number | undefined;

	$effect(() => {
		const next = value;
		const last = previous;
		previous = next;
		if (last === undefined || last === next) return;
		outgoing = last;
		const id = setTimeout(() => (outgoing = null), duration);
		return () => clearTimeout(id);
	});
</script>

{#if motionReduced()}
	<span class={klass}>{value}</span>
{:else}
	<span class="morph {klass}">
		{#key value}
			<span class="morph-layer" in:morphIn={{ duration }} out:morphOut={{ duration }}>
				{value}
			</span>
		{/key}
		<!-- invisible copies hold the box open so layout never jumps mid-swap;
		     stacked in a grid cell so the box takes the wider of the two -->
		<span class="morph-sizer" aria-hidden="true">
			<span class="morph-size-item">{value}</span>
			{#if outgoing !== null}<span class="morph-size-item">{outgoing}</span>{/if}
		</span>
	</span>
{/if}

<style>
	.morph {
		position: relative;
		display: inline-block;
		vertical-align: bottom;
	}
	.morph-layer {
		position: absolute;
		inset: 0;
		display: inline-block;
		white-space: nowrap;
	}
	.morph-sizer {
		visibility: hidden;
		display: inline-grid;
	}
	.morph-size-item {
		grid-area: 1 / 1;
		white-space: nowrap;
	}
</style>
