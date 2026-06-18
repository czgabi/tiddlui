<script lang="ts">
	import { onMount } from 'svelte';
	import { player } from '$lib/stores/player.svelte';

	const W = 1000;
	const H = 100;
	const BASE = 100;

	let wrap = $state<HTMLDivElement | null>(null);
	let prog = $state(0);
	let dragging = $state(false);

	// Static geometry from the amplitude envelope.
	const contour = $derived.by(() => {
		const a = player.analysis;
		if (!a) return '';
		const n = a.peaks.length;
		return a.peaks
			.map((v, i) => `${i ? 'L' : 'M'} ${((i / (n - 1)) * W).toFixed(1)} ${(BASE - v * 92).toFixed(1)}`)
			.join(' ');
	});
	const silhouette = $derived(contour ? `M 0 ${BASE} ${contour.slice(1)} L ${W} ${BASE} Z` : '');

	onMount(() => {
		let raf = 0;
		const tick = () => {
			prog = player.analysis ? Math.max(0, Math.min(1, player.progress)) : 0;
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	});

	function fracFromEvent(e: PointerEvent): number {
		const r = wrap!.getBoundingClientRect();
		return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
	}
	function onDown(e: PointerEvent) {
		if (!player.path) return;
		dragging = true;
		wrap?.setPointerCapture(e.pointerId);
		player.scrub(fracFromEvent(e));
	}
	function onMove(e: PointerEvent) {
		if (dragging) player.scrub(fracFromEvent(e));
	}
	function onUp(e: PointerEvent) {
		dragging = false;
		wrap?.releasePointerCapture(e.pointerId);
	}
</script>

<div
	bind:this={wrap}
	role="slider"
	aria-label="Seek"
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={Math.round(prog * 100)}
	tabindex="0"
	onpointerdown={onDown}
	onpointermove={onMove}
	onpointerup={onUp}
	class="relative h-11 w-full cursor-pointer touch-none select-none"
>
	{#if player.analysis}
		<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" class="h-full w-full">
			<defs>
				<clipPath id="wf-played"><rect x="0" y="0" width={prog * W} height={H} /></clipPath>
				<linearGradient id="wf-fill" x1="0" y1="1" x2="0" y2="0">
					<stop offset="0%" stop-color="var(--accent-cyan)" stop-opacity="0.10" />
					<stop offset="100%" stop-color="var(--accent-purple)" stop-opacity="0.55" />
				</linearGradient>
			</defs>

			<!-- played fill under the line -->
			<path d={silhouette} fill="url(#wf-fill)" clip-path="url(#wf-played)" />
			<!-- the waveform line -->
			<path
				d={contour}
				fill="none"
				stroke="var(--muted-foreground)"
				stroke-opacity="0.55"
				stroke-width="1.2"
				vector-effect="non-scaling-stroke"
			/>
			<!-- bright line over the played part -->
			<path
				d={contour}
				fill="none"
				stroke="var(--accent-cyan)"
				stroke-width="1.6"
				vector-effect="non-scaling-stroke"
				clip-path="url(#wf-played)"
			/>
			<!-- playhead -->
			<line
				x1={prog * W}
				y1="0"
				x2={prog * W}
				y2={H}
				stroke="var(--accent-pink)"
				stroke-width="1.6"
				vector-effect="non-scaling-stroke"
			/>
		</svg>
	{:else}
		<div class="flex h-full items-center">
			<div class="h-px w-full bg-foreground/15"></div>
		</div>
	{/if}
</div>
