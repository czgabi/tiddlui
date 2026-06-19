<script lang="ts">
	import { ChevronRight, X, FolderOpen, Download, CheckCircle2, AlertCircle, Trash2 } from '@lucide/svelte';
	import { revealItemInDir } from '@tauri-apps/plugin-opener';
	import { downloads } from '$lib/stores/download.svelte';
	import { player } from '$lib/stores/player.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { engine } from '$lib/ipc/commands';
	import { formatPercent, relativeDate } from '$lib/format';
	import type { QueueItem } from '$lib/types';

	function label(item: QueueItem): string {
		if (item.resource?.title) {
			return item.resource.artist
				? `${item.resource.artist} — ${item.resource.title}`
				: item.resource.title;
		}
		if (item.current_title) return `${item.current_artist ?? ''} — ${item.current_title}`.replace(/^ — /, '');
		if (item.path) return item.path.split(/[/\\]/).pop() ?? item.url;
		return item.url;
	}

	function reveal(item: QueueItem) {
		if (item.path) revealItemInDir(item.path).catch(() => {});
	}

	// Clicking a history row selects it: shows its metadata + loads the player.
	function selectItem(item: QueueItem) {
		if (item.resource) downloads.selected = item.resource;
		if (item.path) player.load(item.path, label(item));
	}

	// Delete the downloaded file (and prune its folder), then drop the entry.
	function deleteItem(item: QueueItem) {
		if (item.path) engine.deleteFile(item.path);
		if (player.path === item.path) player.unload();
		downloads.remove(item.id);
	}

	function clearHistory() {
		downloads.clearHistory();
		player.clearCache();
	}
</script>

<aside
	class="glass relative h-full overflow-hidden transition-[width] duration-300 {ui.queueOpen
		? 'w-80'
		: 'w-12'}"
>
	<button
		onclick={() => (ui.queueOpen = !ui.queueOpen)}
		title="Queue & History ({ui.mod}+H)"
		class="absolute top-3.5 left-3.5 z-20 text-foreground"
	>
		<ChevronRight class="size-4 transition-transform duration-300 {ui.queueOpen ? 'rotate-90' : ''}" />
	</button>

	<!-- fixed-width content: clipped (not reflowed) when collapsed, so text never morphs -->
	<div
		class="flex h-full w-80 flex-col transition-opacity duration-200 {ui.queueOpen
			? 'opacity-100'
			: 'pointer-events-none opacity-0'}"
	>
		<div class="flex items-center gap-2 py-3 pr-4 pl-10 text-sm font-medium text-foreground">
			<span>Queue &amp; History</span>
			<span class="ml-auto text-xs text-muted-foreground">{ui.mod}+H</span>
		</div>

		<div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
			{#if downloads.downloading.length}
				<section>
					<h3 class="px-1 pb-2 text-[11px] font-semibold tracking-wide text-accent-cyan uppercase">
						Downloading
					</h3>
					{#each downloads.downloading as item (item.id)}
						<div class="rounded-lg bg-foreground/5 p-2.5">
							<div class="flex items-center gap-2.5">
								<Download class="size-4 shrink-0 text-accent-cyan" />
								<span class="min-w-0 flex-1 truncate text-sm">{label(item)}</span>
								<button onclick={() => engine.cancel(item.id)} title="Cancel" aria-label="Cancel" class="text-muted-foreground hover:text-destructive">
									<X class="size-4" />
								</button>
							</div>
							{#if item.total && item.total > 1}
								<!-- album/playlist: current track + overall -->
								<div class="mt-2 truncate text-[11px] text-muted-foreground">
									{(item.completed ?? 0) + 1}/{item.total} · {item.current_artist
										? item.current_artist + ' — '
										: ''}{item.current_title ?? ''}
								</div>
								<div class="mt-1 h-1 overflow-hidden rounded-full bg-foreground/10">
									<div class="h-full rounded-full bg-accent-cyan transition-all" style="width: {formatPercent(item.track_progress)}"></div>
								</div>
								<div class="mt-1.5 flex items-center gap-2">
									<span class="text-[10px] tracking-wide text-muted-foreground uppercase">All</span>
									<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
										<div class="h-full rounded-full bg-gradient-to-r from-accent-cyan to-accent-purple transition-all" style="width: {formatPercent(item.progress)}"></div>
									</div>
								</div>
							{:else}
								<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
									<div
										class="h-full rounded-full bg-gradient-to-r from-accent-cyan to-accent-purple transition-all"
										style="width: {formatPercent(item.progress)}"
									></div>
								</div>
							{/if}
						</div>
					{/each}
				</section>
			{/if}

			{#if downloads.queued.length}
				<section>
					<h3 class="px-1 pb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
						Queued
					</h3>
					{#each downloads.queued as item (item.id)}
						<div class="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
							<span class="min-w-0 flex-1 truncate text-sm text-muted-foreground">{label(item)}</span>
							<button onclick={() => engine.cancel(item.id)} class="text-muted-foreground hover:text-destructive">
								<X class="size-3.5" />
							</button>
						</div>
					{/each}
				</section>
			{/if}

			<section>
				<div class="flex items-center justify-between px-1 pb-2">
					<h3 class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">History</h3>
					{#if downloads.history.length}
						<button
							onclick={clearHistory}
							title="Clear history"
							aria-label="Clear history"
							class="text-muted-foreground hover:text-destructive"
						>
							<Trash2 class="size-3.5" />
						</button>
					{/if}
				</div>
				{#if downloads.history.length === 0}
					<p class="px-1 text-xs text-muted-foreground">No downloads yet.</p>
				{/if}
				{#each downloads.history as item (item.id)}
					<div
						class="group flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors {player.path &&
						player.path === item.path
							? 'bg-foreground/10 ring-1 ring-accent-cyan/40'
							: 'hover:bg-foreground/5'}"
					>
						{#if item.status === 'complete'}
							<CheckCircle2 class="size-4 shrink-0 text-emerald-400" />
						{:else}
							<AlertCircle class="size-4 shrink-0 text-destructive" />
						{/if}
						<button
							onclick={() => selectItem(item)}
							disabled={!item.path}
							title={item.path ? 'Load this track' : ''}
							class="min-w-0 flex-1 text-left disabled:cursor-default"
						>
							<div class="truncate text-sm text-muted-foreground hover:text-foreground">{label(item)}</div>
							<div class="text-[11px] text-muted-foreground">{relativeDate(item.created_at)}</div>
						</button>
						<div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
							{#if item.status === 'complete' && item.path}
								<button title="Reveal in folder" aria-label="Reveal in folder" onclick={() => reveal(item)} class="text-muted-foreground hover:text-foreground">
									<FolderOpen class="size-3.5" />
								</button>
							{/if}
							<button title="Delete download" aria-label="Delete download" onclick={() => deleteItem(item)} class="text-muted-foreground hover:text-destructive">
								<Trash2 class="size-3.5" />
							</button>
						</div>
					</div>
				{/each}
			</section>
		</div>
	</div>
</aside>
