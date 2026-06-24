<script lang="ts">
	// Vertical, linear volume slider. Top = max, bottom = mute.
	import { player } from '$lib/stores/player.svelte';

	let track = $state<HTMLDivElement | null>(null);
	let dragging = $state(false);

	const level = $derived(player.muted ? 0 : player.volume);

	function setFromY(clientY: number) {
		if (!track) return;
		const r = track.getBoundingClientRect();
		player.setVolume(1 - (clientY - r.top) / r.height); // top = 1, bottom = 0 (clamped in store)
	}
	function onDown(e: PointerEvent) {
		dragging = true;
		track?.setPointerCapture(e.pointerId);
		setFromY(e.clientY);
	}
	function onMove(e: PointerEvent) {
		if (dragging) setFromY(e.clientY);
	}
	function onUp(e: PointerEvent) {
		dragging = false;
		track?.releasePointerCapture(e.pointerId);
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowUp') { player.setVolume(level + 0.1); e.preventDefault(); }
		else if (e.key === 'ArrowDown') { player.setVolume(level - 0.1); e.preventDefault(); }
	}
</script>

<div
	bind:this={track}
	role="slider"
	aria-label="Volume"
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={Math.round(level * 100)}
	tabindex="0"
	onpointerdown={onDown}
	onpointermove={onMove}
	onpointerup={onUp}
	onkeydown={onKey}
	class="relative h-24 w-2 cursor-pointer touch-none rounded-full bg-foreground/15 select-none"
>
	<div
		class="absolute bottom-0 left-0 w-full rounded-full bg-gradient-to-t from-accent-cyan to-accent-purple"
		style="height: {level * 100}%"
	></div>
	<div
		class="absolute left-1/2 size-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow ring-1 ring-black/10"
		style="bottom: {level * 100}%"
	></div>
</div>
