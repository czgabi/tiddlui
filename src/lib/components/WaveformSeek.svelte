<script lang="ts">
	import { onMount } from 'svelte';
	import { player } from '$lib/stores/player.svelte';
	import { motionReduced } from '$lib/motion';

	const W = 1000;
	const H = 100;
	const BASE = 100;

	let wrap = $state<HTMLDivElement | null>(null);
	let prog = $state(0);
	let dragging = $state(false);
	let dragFrac = $state<number | null>(null);

	// A waveform arrives all at once (the engine can only emit it once the whole
	// track is decoded), so it draws itself in left-to-right instead of popping
	// into place. Purely cosmetic — the data is already complete.
	const REVEAL_MS = 550;
	let reveal = $state(1);
	let revealFrom = 0;

	$effect(() => {
		if (!player.analysis) return;
		if (motionReduced()) {
			reveal = 1;
			return;
		}
		reveal = 0;
		revealFrom = performance.now();
	});

	// A deliberately calm stand-in shown while the real envelope is still being
	// decoded. Fixed seed so it doesn't twitch between renders, and kept low and
	// faint so it reads as a placeholder rather than as audio data.
	const placeholder = (() => {
		let seed = 1337;
		const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
		const n = 96;
		const vals = Array.from({ length: n }, (_, i) => {
			const envelope = Math.sin((i / (n - 1)) * Math.PI); // fade in and out
			return 0.18 + envelope * (0.22 + rnd() * 0.16);
		});
		return curve(vals);
	})();

	/** Build the line + fill path pair for a 0..1 series. */
	function curve(values: number[]) {
		if (values.length < 2) return { line: '', fill: '' };
		const n = values.length;
		const pts = values.map((v, i) => [(i / (n - 1)) * W, BASE - v * 90] as [number, number]);
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
	}

	// Smooth curve (quadratic through midpoints) → no sharp edges.
	const paths = $derived.by(() =>
		player.analysis ? curve(player.analysis.peaks) : { line: '', fill: '' }
	);

	onMount(() => {
		let raf = 0;
		const tick = () => {
			if (!player.path) prog = 0;
			else if (dragFrac !== null) prog = dragFrac; // follow cursor while scrubbing
			else prog = Math.max(0, Math.min(1, player.progress));

			if (reveal < 1) {
				const t = Math.min(1, (performance.now() - revealFrom) / REVEAL_MS);
				reveal = 1 - Math.pow(1 - t, 3); // ease-out: quick, then settles
			}
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
				<clipPath id="wf-reveal"><rect x="0" y="0" width={reveal * W} height={H} /></clipPath>
				<clipPath id="wf-played"><rect x="0" y="0" width={prog * W} height={H} /></clipPath>
				<linearGradient id="wf-fill" x1="0" y1="1" x2="0" y2="0">
					<stop offset="0%" stop-color="var(--accent-cyan)" stop-opacity="0.10" />
					<stop offset="100%" stop-color="var(--accent-purple)" stop-opacity="0.55" />
				</linearGradient>
			</defs>

			<!-- everything is clipped to the reveal so the waveform draws itself in -->
			<g clip-path="url(#wf-reveal)">
				<path d={paths.fill} fill="url(#wf-fill)" clip-path="url(#wf-played)" />
				<path d={paths.line} fill="none" stroke="var(--muted-foreground)" stroke-opacity="0.5"
					stroke-width="1.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
				<path d={paths.line} fill="none" stroke="var(--accent-cyan)" stroke-width="1.7"
					stroke-linejoin="round" vector-effect="non-scaling-stroke" clip-path="url(#wf-played)" />
				<line x1={prog * W} y1="0" x2={prog * W} y2={H} stroke="var(--accent-pink)"
					stroke-width="1.6" vector-effect="non-scaling-stroke" />
			</g>
		</svg>
	{:else}
		<!-- The envelope only exists once the whole track is decoded, so until then
		     this shows a calm placeholder that the real waveform then draws over,
		     rather than a bare progress bar. -->
		<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" class="h-full w-full">
			<defs>
				<clipPath id="wf-pending"><rect x="0" y="0" width={prog * W} height={H} /></clipPath>
				<linearGradient id="wf-shimmer" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" stop-color="var(--accent-cyan)" stop-opacity="0" />
					<stop offset="50%" stop-color="var(--accent-cyan)" stop-opacity="0.35" />
					<stop offset="100%" stop-color="var(--accent-cyan)" stop-opacity="0" />
				</linearGradient>
			</defs>

			<path d={placeholder.line} fill="none" stroke="var(--muted-foreground)"
				stroke-opacity="0.28" stroke-width="1.2" stroke-linejoin="round"
				vector-effect="non-scaling-stroke" />
			<!-- what has already played still reads, so seeking works while waiting -->
			<path d={placeholder.line} fill="none" stroke="var(--accent-cyan)" stroke-opacity="0.5"
				stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"
				clip-path="url(#wf-pending)" />
			{#if !motionReduced()}
				<rect class="shimmer" x="0" y="0" width="260" height={H} fill="url(#wf-shimmer)" />
			{/if}
			<line x1={prog * W} y1="0" x2={prog * W} y2={H} stroke="var(--accent-pink)"
				stroke-width="1.6" vector-effect="non-scaling-stroke" />
		</svg>
	{/if}
</div>

<style>
	/* Sweeps across while the real envelope is still decoding. The rect is only
	   rendered when motion is enabled, so there is nothing to override here. */
	.shimmer {
		animation: wf-sweep 1.7s ease-in-out infinite;
	}
	@keyframes wf-sweep {
		from {
			transform: translateX(-280px);
		}
		to {
			transform: translateX(1000px);
		}
	}
</style>
