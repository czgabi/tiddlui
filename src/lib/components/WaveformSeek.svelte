<script lang="ts">
	import { onMount } from 'svelte';
	import { player } from '$lib/stores/player.svelte';

	const W = 1000;
	const H = 100;
	const BASE = 100;

	let wrap = $state<HTMLDivElement | null>(null);
	let prog = $state(0);
	let dragging = $state(false);
	let dragFrac = $state<number | null>(null);

	// Smooth curve (quadratic through midpoints) → no sharp edges.
	const paths = $derived.by(() => {
		const a = player.analysis;
		if (!a || a.peaks.length < 2) return { line: '', fill: '' };
		const n = a.peaks.length;
		const pts = a.peaks.map((v, i) => [(i / (n - 1)) * W, BASE - v * 90] as [number, number]);
		let mid = '';
		for (let i = 1; i < pts.length - 1; i++) {
			const mx = (pts[i][0] + pts[i + 1][0]) / 2;
			const my = (pts[i][1] + pts[i + 1][1]) / 2;
			mid += ` Q ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
		}
		const last = pts[pts.length - 1];
		mid += ` L ${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
		const start = `${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
		return { line: `M ${start}${mid}`, fill: `M 0 ${BASE} L ${start}${mid} L ${W} ${BASE} Z` };
	});

	onMount(() => {
		let raf = 0;
		const tick = () => {
			if (!player.path) prog = 0;
			else if (dragFrac !== null) prog = dragFrac; // follow cursor while scrubbing
			else prog = Math.max(0, Math.min(1, player.progress));
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
		dragFrac = fracFromEvent(e); // preview only — keep playing until release
		wrap?.setPointerCapture(e.pointerId);
	}
	function onMove(e: PointerEvent) {
		if (dragging) dragFrac = fracFromEvent(e);
	}
	function onUp(e: PointerEvent) {
		if (dragging && dragFrac !== null) player.scrub(dragFrac); // skip now
		dragging = false;
		dragFrac = null;
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

			<path d={paths.fill} fill="url(#wf-fill)" clip-path="url(#wf-played)" />
			<path d={paths.line} fill="none" stroke="var(--muted-foreground)" stroke-opacity="0.5"
				stroke-width="1.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
			<path d={paths.line} fill="none" stroke="var(--accent-cyan)" stroke-width="1.7"
				stroke-linejoin="round" vector-effect="non-scaling-stroke" clip-path="url(#wf-played)" />
			<line x1={prog * W} y1="0" x2={prog * W} y2={H} stroke="var(--accent-pink)"
				stroke-width="1.6" vector-effect="non-scaling-stroke" />
		</svg>
	{:else}
		<!-- streamed preview (no local file to analyze): plain seek bar -->
		<div class="flex h-full items-center">
			<div class="relative h-1.5 w-full rounded-full bg-foreground/15">
				<div
					class="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent-cyan to-accent-purple"
					style="width: {prog * 100}%"
				></div>
				<div
					class="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-1 ring-black/10"
					style="left: {prog * 100}%"
				></div>
			</div>
		</div>
	{/if}
</div>
