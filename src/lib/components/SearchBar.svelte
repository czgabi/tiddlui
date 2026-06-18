<script lang="ts">
	import { Search, X, Loader2, Link2 } from '@lucide/svelte';
	import { engine } from '$lib/ipc/commands';
	import { search } from '$lib/stores/search.svelte';
	import { downloads } from '$lib/stores/download.svelte';
	import { player } from '$lib/stores/player.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { startDownload } from '$lib/queue';
	import { formatDuration } from '$lib/format';
	import { TidalUrlIsValid, tidalUrl } from '$lib/url';
	import type { Resource, ResourceKind } from '$lib/types';

	let inputEl = $state<HTMLInputElement | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let urlMode = $state(false);

	export function focus() {
		inputEl?.focus();
		inputEl?.select();
	}

	function onInput() {
		clearTimeout(timer);
		const q = search.query.trim();
		urlMode = TidalUrlIsValid(q);

		if (!q) {
			search.clear();
			downloads.url = '';
			downloads.selected = null;
			return;
		}

		// URL → auto-resolve & load (no dropdown)
		if (urlMode) {
			search.clear();
			downloads.url = q;
			if (auth.loggedIn) timer = setTimeout(() => engine.resolve(q, ++search.requestId), 300);
			return;
		}

		// query → debounced search dropdown
		if (!auth.loggedIn) return;
		search.loading = true;
		timer = setTimeout(() => engine.search(q, ++search.requestId), 300);
	}

	function pick(r: Resource) {
		downloads.selected = r;
		downloads.url = tidalUrl(r.kind, r.id);
		search.query = `${r.artist ? r.artist + ' — ' : ''}${r.title}`;
		search.open = false;
		urlMode = true;
	}

	function clear() {
		search.query = '';
		search.clear();
		downloads.url = '';
		downloads.selected = null;
		downloads.tracklist = [];
		downloads.tracklistUrl = null;
		player.unload(); // stop playback + clear the loaded track
		urlMode = false;
		focus();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') search.open = false;
		else if (e.key === 'Enter' && urlMode && downloads.url) startDownload(downloads.url, { resource: downloads.selected ?? undefined });
	}

	const groups: { key: ResourceKind; label: string }[] = [
		{ key: 'track', label: 'Tracks' },
		{ key: 'album', label: 'Albums' },
		{ key: 'playlist', label: 'Playlists' },
		{ key: 'artist', label: 'Artists' }
	];
	const iconFor = { track: '♪', album: '⊚', playlist: '☰', artist: '◓' };

	function itemsFor(kind: ResourceKind): Resource[] {
		const r = search.results;
		if (!r) return [];
		return (r[`${kind}s` as 'tracks' | 'albums' | 'playlists' | 'artists'] ?? []).slice(0, 5);
	}
</script>

<svelte:window
	onclick={(e) => {
		if (!(e.target as HTMLElement)?.closest('.search-root')) search.open = false;
	}}
/>

<div class="search-root relative w-full">
	<div class="glass flex items-center gap-3 px-4 py-2.5">
		{#if urlMode}
			<Link2 class="size-4 shrink-0 text-accent-cyan" />
		{:else}
			<Search class="size-4 shrink-0 text-muted-foreground" />
		{/if}
		<input
			bind:this={inputEl}
			bind:value={search.query}
			oninput={onInput}
			onfocus={() => search.hasResults && (search.open = true)}
			onkeydown={onKeydown}
			placeholder={auth.loggedIn
				? `Search or paste a Tidal link…  ${ui.mod}+K`
				: 'Sign in to search Tidal'}
			disabled={!auth.loggedIn}
			class="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
		/>
		{#if search.loading}
			<Loader2 class="size-4 shrink-0 animate-spin text-accent-cyan" />
		{:else if search.query}
			<button onclick={clear} class="text-muted-foreground hover:text-foreground">
				<X class="size-4" />
			</button>
		{/if}
	</div>

	{#if search.open && search.hasResults}
		<div
			class="glass glass-strong absolute top-[calc(100%+0.5rem)] z-50 max-h-[60vh] w-full overflow-y-auto p-2 shadow-2xl"
		>
			{#each groups as g (g.key)}
				{@const items = itemsFor(g.key)}
				{#if items.length}
					<div class="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
						{g.label}
					</div>
					{#each items as item (item.id)}
						<button
							onclick={() => pick(item)}
							class="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-foreground/5"
						>
							{#if item.cover_url}
								<img src={item.cover_url} alt="" class="size-9 rounded-md object-cover" />
							{:else}
								<div class="grid size-9 place-items-center rounded-md bg-foreground/5 text-muted-foreground">
									{iconFor[g.key]}
								</div>
							{/if}
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm text-foreground">{item.title}</div>
								<div class="truncate text-xs text-muted-foreground">
									{item.artist}{#if item.duration}&nbsp;•&nbsp;{formatDuration(item.duration)}{/if}
								</div>
							</div>
						</button>
					{/each}
				{/if}
			{/each}
		</div>
	{/if}
</div>
