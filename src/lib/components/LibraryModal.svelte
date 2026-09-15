<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { Loader2, Music2, Disc3, ListMusic, User, Search, X } from '@lucide/svelte';

	import MorphText from '$lib/components/MorphText.svelte';
	import { library, FAV_KINDS, SORTS, type FavKind, type SortId } from '$lib/stores/library.svelte';
	import { downloads } from '$lib/stores/download.svelte';
	import { search } from '$lib/stores/search.svelte';
	import { engine } from '$lib/ipc/commands';
	import { formatDuration } from '$lib/format';
	import { tidalUrl } from '$lib/url';
	import type { Resource } from '$lib/types';

	const placeholder = { track: Music2, album: Disc3, playlist: ListMusic, artist: User };

	let input = $state<HTMLInputElement | null>(null);

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

	function openSearch() {
		library.startSearch();
		// wait for the field to exist before focusing it
		setTimeout(() => input?.focus(), 60);
	}

	const sortLabel = $derived(SORTS.find((s) => s.id === library.sort)?.label ?? 'Recently added');
</script>

<Dialog.Root bind:open={library.open}>
	<Dialog.Content class="glass-strong border-foreground/10 w-full sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Your Library</Dialog.Title>
			<Dialog.Description>Your saved Tidal favorites.</Dialog.Description>
		</Dialog.Header>

		<!-- Controls. The search field sweeps out from the loupe and covers the
		     tabs, so the row never changes height. -->
		<div class="relative flex h-9 items-center">
			<div
				class="flex w-full items-center gap-1.5 transition-opacity duration-150 {library.searching
					? 'pointer-events-none opacity-0'
					: 'opacity-100'}"
			>
				<button
					onclick={openSearch}
					title="Search your library"
					aria-label="Search your library"
					class="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
				>
					<Search class="size-4" />
				</button>

				{#each FAV_KINDS as k (k.id)}
					<button
						onclick={() => library.show(k.id as FavKind)}
						class="rounded-full px-3 py-1 text-xs font-medium {library.kind === k.id
							? 'bg-accent-cyan/20 text-accent-cyan'
							: 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground'}"
					>
						{k.label}
					</button>
				{/each}

				<div class="ml-auto shrink-0">
					<Select.Root
						type="single"
						value={library.sort}
						onValueChange={(v) => (library.sort = v as SortId)}
					>
						<Select.Trigger class="h-7 rounded-full px-3 text-xs">
							<MorphText value={sortLabel} />
						</Select.Trigger>
						<Select.Content>
							{#each SORTS as s (s.id)}
								<Select.Item value={s.id} label={s.label}>{s.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>

			<!-- sweeps right, over the tabs -->
			<div
				class="absolute inset-y-0 left-0 flex items-center overflow-hidden rounded-full transition-[width] duration-200 ease-out {library.searching
					? 'w-full border border-foreground/10 bg-foreground/5'
					: 'pointer-events-none w-8 opacity-0'}"
			>
				<Search class="ml-2.5 size-4 shrink-0 text-muted-foreground" />
				<input
					bind:this={input}
					bind:value={library.query}
					tabindex={library.searching ? 0 : -1}
					aria-hidden={!library.searching}
					onkeydown={(e) => e.key === 'Escape' && library.endSearch()}
					placeholder="Search your library…"
					class="min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground"
				/>
				<button
					onclick={() => library.endSearch()}
					tabindex={library.searching ? 0 : -1}
					aria-label="Close search"
					class="mr-1.5 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
				>
					<X class="size-3.5" />
				</button>
			</div>
		</div>

		<!-- Fixed height: switching tabs or searching must not resize the dialog. -->
		<div class="flex h-[26rem] flex-col overflow-y-auto pr-1">
			{#if library.searching}
				{#if library.loadingAll}
					<div class="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
						<Loader2 class="size-4 animate-spin text-accent-cyan" /> Reading your library…
					</div>
				{:else if !library.query.trim()}
					<div class="grid flex-1 place-items-center text-sm text-muted-foreground">
						Type to search everything you've saved.
					</div>
				{:else if library.resultCount === 0}
					<div class="grid flex-1 place-items-center text-sm text-muted-foreground">
						Nothing in your library matches that.
					</div>
				{:else}
					{#each library.results as group (group.kind)}
						<div class="px-1 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
							{group.label}
						</div>
						{#each group.items as item (item.kind + item.id)}
							{@const Icon = placeholder[item.kind]}
							<button
								onclick={() => pick(item)}
								class="flex items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-foreground/10"
							>
								{#if item.cover_url}
									<img src={item.cover_url} alt="" class="size-10 shrink-0 object-cover {item.kind === 'artist' ? 'rounded-full' : 'rounded-md'}" />
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
					{/each}
				{/if}
			{:else}
				{#each library.sorted as item (item.kind + item.id)}
					{@const Icon = placeholder[item.kind]}
					<button
						onclick={() => pick(item)}
						class="flex items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-foreground/10"
					>
						{#if item.cover_url}
							<img src={item.cover_url} alt="" class="size-10 shrink-0 object-cover {item.kind === 'artist' ? 'rounded-full' : 'rounded-md'}" />
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
					<div class="grid flex-1 place-items-center text-sm text-muted-foreground">Nothing saved here yet.</div>
				{:else if library.canLoadMore}
					<Button variant="ghost" size="sm" class="mt-1 self-center" onclick={() => library.loadMore()}>
						Load more ({library.items.length} of {library.total})
					</Button>
				{/if}
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
