<script lang="ts">
	// Text that changes in place — a quality label, a status word — blurs from
	// one value to the next. The two states overlap deliberately: waiting for the
	// old one to leave before the new one arrives reads as a flicker, not a morph.
	// The states are stacked so surrounding layout never jumps mid-swap.
	import { blur } from 'svelte/transition';
	import { motionReduced } from '$lib/motion';

	let {
		value,
		duration = 130,
		class: klass = ''
	}: { value: string | number; duration?: number; class?: string } = $props();
</script>

{#if motionReduced()}
	<span class={klass}>{value}</span>
{:else}
	<span class="morph {klass}">
		{#key value}
			<span
				class="morph-layer"
				in:blur={{ amount: 3, duration }}
				out:blur={{ amount: 3, duration: duration * 0.6 }}
			>
				{value}
			</span>
		{/key}
		<!-- an invisible copy holds the box open at the widest of the two states -->
		<span class="morph-sizer" aria-hidden="true">{value}</span>
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
		display: inline-block;
		white-space: nowrap;
	}
</style>
