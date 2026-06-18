<script lang="ts">
	import { ChevronRight, X, FolderOpen, RotateCw, Download, CheckCircle2, AlertCircle, Play } from '@lucide/svelte';
	import { revealItemInDir } from '@tauri-apps/plugin-opener';
	import { downloads } from '$lib/stores/download.svelte';
	import { player } from '$lib/stores/player.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { engine } from '$lib/ipc/commands';
	import { startDownload } from '$lib/queue';
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

	function playItem(item: QueueItem) {
		if (item.path) player.load(item.path, label(item));
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
						<div class="rounded-lg bg-white/5 p-2.5">
							<div class="flex items-center gap-2.5">
								<Download class="size-4 shrink-0 text-accent-cyan" />
								<span class="min-w-0 flex-1 truncate text-sm">{label(item)}</span>
								<button onclick={() => engine.cancel(item.id)} class="text-muted-foreground hover:text-destructive">
									<X class="size-4" />
								</button>
							</div>
							<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
								<div
									class="h-full rounded-full bg-gradient-to-r from-accent-cyan to-accent-purple transition-all"
									style="width: {formatPercent(item.progress)}"
								></div>
							</div>
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
				<h3 class="px-1 pb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
					History
				</h3>
				{#if downloads.history.length === 0}
					<p class="px-1 text-xs text-muted-foreground/60">No downloads yet.</p>
				{/if}
				{#each downloads.history as item (item.id)}
					<div class="group flex items-center gap-2.5 rounded-lg px-1 py-1.5">
						{#if item.status === 'complete'}
							<CheckCircle2 class="size-4 shrink-0 text-emerald-400" />
						{:else if item.status === 'cancelled'}
							<X class="size-4 shrink-0 text-muted-foreground" />
						{:else}
							<AlertCircle class="size-4 shrink-0 text-destructive" />
						{/if}
						<button
							onclick={() => reveal(item)}
							disabled={!item.path}
							title={item.path ? 'Reveal in folder' : ''}
							class="min-w-0 flex-1 text-left disabled:cursor-default"
						>
							<div class="truncate text-sm text-muted-foreground hover:text-foreground">{label(item)}</div>
							<div class="text-[11px] text-muted-foreground/60">{relativeDate(item.created_at)}</div>
						</button>
						<div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
							{#if item.status === 'complete' && item.path}
								<button title="Play / visualize" onclick={() => playItem(item)} class="text-muted-foreground hover:text-foreground">
									<Play class="size-3.5" />
								</button>
								<button title="Reveal in folder" onclick={() => reveal(item)} class="text-muted-foreground hover:text-foreground">
									<FolderOpen class="size-3.5" />
								</button>
							{/if}
							<button title="Download again" onclick={() => startDownload(item.url, { quality: item.quality, resource: item.resource })} class="text-muted-foreground hover:text-foreground">
								<RotateCw class="size-3.5" />
							</button>
						</div>
					</div>
				{/each}
			</section>
		</div>
	</div>
</aside>
