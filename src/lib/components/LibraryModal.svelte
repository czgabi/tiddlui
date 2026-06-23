<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Loader2, Music2, Disc3, ListMusic, User } from '@lucide/svelte';

	import { library, FAV_KINDS, type FavKind } from '$lib/stores/library.svelte';
	import { downloads } from '$lib/stores/download.svelte';
	import { search } from '$lib/stores/search.svelte';
	import { engine } from '$lib/ipc/commands';
	import { formatDuration } from '$lib/format';
	import { tidalUrl } from '$lib/url';
	import type { Resource } from '$lib/types';

	const placeholder = { track: Music2, album: Disc3, playlist: ListMusic, artist: User };

	function pick(item: Resource) {
		downloads.url = tidalUrl(item.kind, item.id);
		downloads.select(item);
		// Artists need a follow-up fetch for bio/top tracks/discography.
		if (item.kind === 'artist') engine.resolve(downloads.url, ++search.requestId);
		library.open = false;
	}

	function subtitle(item: Resource): string {
		if (item.kind === 'track' || item.kind === 'album') return item.artist ?? '';
		if (item.kind === 'playlist') return `${item.number_of_tracks ?? ''} tracks`.trim();
		return 'Artist';
	}
</script>

<Dialog.Root bind:open={library.open}>
	<Dialog.Content class="glass-strong border-foreground/10 w-full sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Your Library</Dialog.Title>
			<Dialog.Description>Your saved Tidal favorites.</Dialog.Description>
		</Dialog.Header>

		<!-- kind tabs -->
		<div class="flex gap-1.5">
			{#each FAV_KINDS as k (k.id)}
				<button
					onclick={() => library.show(k.id as FavKind)}
					class="rounded-full px-3 py-1 text-xs font-medium transition-colors {library.kind === k.id
						? 'bg-accent-cyan/20 text-accent-cyan'
						: 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground'}"
				>
					{k.label}
				</button>
			{/each}
		</div>

		<!-- items -->
		<div class="flex max-h-[60vh] min-h-[12rem] flex-col overflow-y-auto pr-1">
			{#each library.items as item (item.kind + item.id)}
				{@const Icon = placeholder[item.kind]}
				<button
					onclick={() => pick(item)}
					class="group flex items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-foreground/10"
				>
					{#if item.cover_url}
						<img src={item.cover_url} alt="" class="size-10 shrink-0 rounded-md object-cover {item.kind === 'artist' ? 'rounded-full' : ''}" />
					{:else}
						<div class="grid size-10 shrink-0 place-items-center rounded-md bg-foreground/5"><Icon class="size-5 text-muted-foreground/50" /></div>
					{/if}
					<div class="min-w-0 flex-1">
						<div class="truncate text-sm text-foreground">{item.title}</div>
						<div class="truncate text-xs text-muted-foreground">{subtitle(item)}</div>
					</div>
					{#if item.duration}
						<span class="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDuration(item.duration)}</span>
					{/if}
				</button>
			{/each}

			{#if library.loading}
				<div class="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
					<Loader2 class="size-4 animate-spin text-accent-cyan" /> Loading…
				</div>
			{:else if library.items.length === 0}
				<div class="grid flex-1 place-items-center py-8 text-sm text-muted-foreground">Nothing saved here yet.</div>
			{:else if library.canLoadMore}
				<Button variant="ghost" size="sm" class="mt-1 self-center" onclick={() => library.loadMore()}>
					Load more ({library.items.length} of {library.total})
				</Button>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
