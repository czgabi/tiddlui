<script lang="ts">
	import { QUALITIES, QUALITY_LABELS, QUALITY_DESC, type Quality } from '$lib/types';
	import MorphText from '$lib/components/MorphText.svelte';

	let { value = $bindable('HIGH') }: { value?: Quality } = $props();

	let track = $state<HTMLDivElement | null>(null);
	let dragging = $state(false);
	let dragPct = $state<number | null>(null); // knob position while scrubbing (with resistance)

	const index = $derived(Math.max(0, QUALITIES.indexOf(value)));
	const pct = $derived((index / (QUALITIES.length - 1)) * 100);
	const knobPct = $derived(dragPct ?? pct);

	function setFromX(clientX: number) {
		if (!track) return;
		const r = track.getBoundingClientRect();
		const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
		const near = Math.round(frac * (QUALITIES.length - 1));
		value = QUALITIES[near];
		// knob is magnetized to the snap and only drifts 40% toward the cursor —
		// gives a subtle "doesn't want to let go" resistance until it jumps.
		const snapP = (near / (QUALITIES.length - 1)) * 100;
		dragPct = snapP + (frac * 100 - snapP) * 0.4;
	}
	function onDown(e: PointerEvent) {
		dragging = true;
		track?.setPointerCapture(e.pointerId);
		setFromX(e.clientX);
	}
	function onMove(e: PointerEvent) {
		if (dragging) setFromX(e.clientX);
	}
	function onUp(e: PointerEvent) {
		dragging = false;
		dragPct = null; // snap exactly to the selected mode
		track?.releasePointerCapture(e.pointerId);
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
			value = QUALITIES[Math.max(0, index - 1)];
			e.preventDefault();
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
			value = QUALITIES[Math.min(QUALITIES.length - 1, index + 1)];
			e.preventDefault();
		}
	}
</script>

<div class="flex items-center gap-3">
	<span class="text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">Quality</span>

	<div
		bind:this={track}
		role="slider"
		aria-label="Download quality"
		aria-valuemin={0}
		aria-valuemax={QUALITIES.length - 1}
		aria-valuenow={index}
		aria-valuetext={QUALITY_LABELS[value]}
		tabindex="0"
		onpointerdown={onDown}
		onpointermove={onMove}
		onpointerup={onUp}
		onkeydown={onKey}
		class="qs-track relative h-5 w-36 cursor-pointer touch-none select-none"
	>
		<!-- rail -->
		<div class="absolute top-1/2 right-0 left-0 h-[3px] -translate-y-1/2 rounded-full bg-foreground/12"></div>
		<!-- fill (tracks the knob exactly so the bar never drifts ahead of the dot) -->
		<div
			class="qs-fill absolute top-1/2 left-0 h-[3px] -translate-y-1/2 rounded-full bg-gradient-to-r from-accent-cyan to-accent-purple"
			style="width: {knobPct}%"
		></div>
		<!-- snap ticks -->
		{#each QUALITIES as q, i (q)}
			<div
				class="absolute top-1/2 size-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full {i <= index
					? 'bg-foreground/0'
					: 'bg-foreground/30'}"
				style="left: {(i / (QUALITIES.length - 1)) * 100}%"
			></div>
		{/each}
		<!-- knob -->
		<div
			class="qs-knob absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md ring-1 ring-black/10"
			class:scale-110={dragging}
			style="left: {knobPct}%"
		></div>
	</div>

	<span class="w-10 text-xs font-medium text-foreground">
		<MorphText value={QUALITY_LABELS[value]} />
	</span>
	<span class="hidden text-[11px] text-muted-foreground lg:inline">
		<MorphText value={QUALITY_DESC[value]} />
	</span>
</div>

<style>
	/* No transition on the fill or knob: they track the pointer exactly, and the
	   snap between quality steps is instant. Easing them lagged behind the
	   cursor and softened the step boundaries — the magnetic resistance in
	   setFromX already supplies the feel, and it does so without the lag. */
	.qs-track:focus-visible {
		outline: none;
	}
	.qs-track:focus-visible .qs-knob {
		box-shadow:
			0 0 0 4px rgba(0, 217, 255, 0.25),
			0 1px 3px rgba(0, 0, 0, 0.4);
	}
</style>
