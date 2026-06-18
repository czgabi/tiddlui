<script lang="ts">
	import '../app.css';
	import { settings } from '$lib/stores/settings.svelte';

	let { children } = $props();

	// Persist the quality tier when it changes (the slider lives in two places).
	$effect(() => {
		settings.quality;
		if (settings.loaded) settings.save();
	});
</script>

<!-- Ambient cyan→purple→pink glow behind all glass surfaces -->
<div class="app-backdrop"></div>

<div class="relative z-10 h-screen w-screen overflow-hidden">
	{@render children?.()}
</div>
