<script lang="ts">
	// Text that changes in place — a quality label, a status word — crossfades
	// through a blur instead of snapping to the new value. The two states are
	// stacked so the surrounding layout never jumps mid-swap.
	import { fade, blur } from 'svelte/transition';
	import { motionReduced } from '$lib/motion';

	let {
		value,
		duration = 220,
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
				in:blur={{ amount: 4, duration, delay: duration * 0.35 }}
				out:fade={{ duration: duration * 0.4 }}
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
