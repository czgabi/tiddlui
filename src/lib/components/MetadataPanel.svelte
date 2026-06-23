<script lang="ts">
	import { Disc3, Music2, ListMusic, User, Play, Pause, Volume2, VolumeX, Download, BadgeCheck, Loader2, Copy, X, Maximize2, ArrowLeft } from '@lucide/svelte';
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { save } from '@tauri-apps/plugin-dialog';
	import WaveformSeek from '$lib/components/WaveformSeek.svelte';
	import { Button } from '$lib/components/ui/button';
	import { downloads } from '$lib/stores/download.svelte';
	import { player } from '$lib/stores/player.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { engine } from '$lib/ipc/commands';
	import { startDownload } from '$lib/queue';
	import { formatDuration } from '$lib/format';
	import { tidalUrl } from '$lib/url';
	import type { Resource } from '$lib/types';

	const resource = $derived<Resource | null>(downloads.selected);
	const cover = $derived(resource?.cover_url ?? null);
	const isCollection = $derived(resource?.kind === 'album' || resource?.kind === 'playlist');
	const isArtist = $derived(resource?.kind === 'artist');
	const iconFor = { track: Music2, album: Disc3, playlist: ListMusic, artist: User };

	function back() {
		const p = downloads.backTarget;
		if (!p) return;
		downloads.url = tidalUrl(p.kind, p.id);
		downloads.back();
	}

	let coverOpen = $state(false);
	let tlReq = 0;
	$effect(() => {
		const r = downloads.selected;
		if (r && (r.kind === 'album' || r.kind === 'playlist')) {
			const url = tidalUrl(r.kind, r.id);
			if (downloads.tracklistUrl !== url) {
				downloads.tracklist = [];
				downloads.tracklistUrl = url;
				engine.tracklist(url, ++tlReq);
			}
		}
	});

	function copyText(t: unknown) {
		const s = t == null ? '' : String(t);
		if (!s) return;
		navigator.clipboard?.writeText(s).then(() => ui.notify('Copied')).catch(() => {});
	}
	function copyTrack() {
		if (!resource) return;
		const head = [resource.artist, resource.title].filter(Boolean).join(' - ');
		copyText(resource.album?.title ? `${head}, ${resource.album.title}` : head);
	}
	function hiRes(u: string | null): string {
		return u ? u.replace('/320x320.', '/1280x1280.') : '';
	}
	async function downloadCover() {
		if (!cover) return;
		const dest = await save({ defaultPath: 'cover.jpg', filters: [{ name: 'Image', extensions: ['jpg'] }] });
		if (dest) engine.saveImage(hiRes(cover), dest);
	}

	const headline = $derived.by(() => {
		if (!resource) return [];
		const p: string[] = [];
		if (resource.year) p.push(String(resource.year));
		if (resource.number_of_tracks) p.push(`${resource.number_of_tracks} tracks`);
		if (resource.duration) p.push(formatDuration(resource.duration));
		return p;
	});
	const trackMeta = $derived.by<[string, string, boolean][]>(() => {
		const r = resource;
		if (!r || isCollection) return [];
		const out: [string, string, boolean][] = [];
		if (r.year) out.push(['Year', String(r.year), false]);
		if (r.track_number) out.push(['Track', `#${r.track_number}`, false]);
		if (r.bpm) out.push(['Tempo', `${r.bpm} BPM`, false]);
		if (r.popularity != null) out.push(['Popularity', `${r.popularity}/100`, false]);
		if (r.audio_quality) out.push(['Quality', String(r.audio_quality), false]);
		if (r.explicit) out.push(['Advisory', 'Explicit', false]);
		if (r.album?.title) out.push(['Album', r.album.title, true]);
		if (r.isrc) out.push(['ISRC', r.isrc, false]);
		if (r.copyright) out.push(['Copyright', r.copyright, true]);
		return out;
	});

	function pickTrack(t: Resource) {
		downloads.url = tidalUrl('track', t.id);
		downloads.drillInto(t); // remember the collection/artist for "back"
	}

	function pickAlbum(a: Resource) {
		downloads.url = tidalUrl('album', a.id);
		downloads.drillInto(a); // drill from an artist into one of their albums
	}
</script>

<div class="glass relative flex h-full flex-col overflow-hidden">
	{#if cover}
		<img src={cover} alt="" class="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-[64px] saturate-150" />
		<div class="absolute inset-0 bg-background/75"></div>
	{/if}

	<div class="relative z-10 flex min-h-0 flex-1 flex-col p-5">
		{#if !resource && !player.path}
			<div class="flex h-full flex-col items-center justify-center gap-3 text-center">
				<Disc3 class="size-16 text-muted-foreground/40" />
				<h2 class="text-lg font-semibold text-muted-foreground">Nothing loaded</h2>
				<p class="max-w-xs text-sm text-muted-foreground">Search or paste a Tidal link above. Downloaded tracks play here with a seekable waveform.</p>
			</div>
		{:else}
			<div class="flex min-h-0 flex-1 gap-5">
				<!-- cover (click to enlarge) -->
				<div class="flex w-48 shrink-0 flex-col gap-3">
					<button
						onclick={() => cover && (coverOpen = true)}
						title="Enlarge cover"
						class="group relative aspect-square w-48 overflow-hidden rounded-xl shadow-2xl ring-1 ring-foreground/10"
					>
						{#if cover}
							<img src={cover} alt="" class="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-105" />
							<div class="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
								<Maximize2 class="size-6 text-white" />
							</div>
						{:else}
							{@const Icon = iconFor[resource?.kind ?? 'album']}
							<div class="grid size-full place-items-center bg-foreground/5"><Icon class="size-14 text-muted-foreground/50" /></div>
						{/if}
					</button>
					{#if resource?.audio_quality}
						<span class="inline-flex items-center gap-1.5 self-start rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 text-xs text-accent-cyan">
							<BadgeCheck class="size-3.5" />{resource.audio_quality}
						</span>
					{/if}
				</div>

				<!-- info -->
				<div class="flex min-w-0 flex-1 flex-col">
					{#if downloads.backTarget}
						<button
							onclick={back}
							class="mb-2 -ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
						>
							<ArrowLeft class="size-3.5" /> Back to {downloads.backTarget.title}
						</button>
					{/if}
					<div class="group/head flex items-start gap-2" oncontextmenu={(e) => { e.preventDefault(); copyTrack(); }} role="presentation">
						<div class="min-w-0">
							<h2 class="truncate text-2xl font-semibold text-foreground" title={resource?.title}>{resource?.title ?? player.title}</h2>
							<p class="truncate text-sm text-muted-foreground">{resource?.artist ?? ''}</p>
						</div>
						{#if resource}
							<button onclick={copyTrack} title="Copy “Artist - Title, Album”" aria-label="Copy track info" class="mt-1 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/head:opacity-100 hover:text-foreground">
								<Copy class="size-4" />
							</button>
						{/if}
					</div>
					{#if headline.length}<p class="mt-1 text-xs text-muted-foreground">{headline.join('  •  ')}</p>{/if}

					{#if isCollection}
						<div class="mt-3 flex items-center justify-between gap-2">
							<span class="text-xs text-muted-foreground">{downloads.tracklist.length || resource?.number_of_tracks || ''} tracks</span>
							{#if resource}
								<Button size="sm" onclick={() => startDownload(tidalUrl(resource.kind, resource.id), { resource })}><Download class="size-4" /> Download all</Button>
							{/if}
						</div>
						{#if resource?.kind === 'album' && resource.review}
								<p class="mb-1 max-h-24 shrink-0 overflow-y-auto pr-1 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">{resource.review}</p>
							{/if}
							<div class="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
							{#if downloads.tracklist.length === 0}<p class="text-xs text-muted-foreground">Loading tracks…</p>{/if}
							{#each downloads.tracklist as t, i (t.id)}
								<div class="group relative flex items-center gap-3 rounded-md pr-8 hover:bg-foreground/10">
									<button onclick={() => pickTrack(t)} class="flex min-w-0 flex-1 items-center gap-3 px-2 py-1.5 text-left">
										<span class="w-5 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
										<div class="min-w-0 flex-1"><div class="truncate text-sm text-foreground">{t.title}</div><div class="truncate text-xs text-muted-foreground">{t.artist}</div></div>
										<span class="shrink-0 text-xs text-muted-foreground">{formatDuration(t.duration)}</span>
									</button>
									<button title="Download this track" onclick={() => startDownload(tidalUrl('track', t.id), { resource: t })} class="absolute right-2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent-cyan"><Download class="size-4" /></button>
								</div>
							{/each}
						</div>
					{:else if isArtist}
							<div class="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
								{#if resource?.popularity != null}
									<span class="inline-flex w-fit items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 text-xs text-muted-foreground">
										Popularity {resource.popularity}/100
									</span>
								{/if}
								{#if resource?.bio}
									<p class="shrink-0 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">{resource.bio}</p>
								{/if}
								{#if resource?.top_tracks?.length}
									<div class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Top tracks</div>
									<div class="shrink-0">
										{#each resource.top_tracks as t, i (t.id)}
											<div class="group relative flex items-center gap-3 rounded-md pr-8 hover:bg-foreground/10">
												<button onclick={() => pickTrack(t)} class="flex min-w-0 flex-1 items-center gap-3 px-2 py-1.5 text-left">
													<span class="w-5 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
													<div class="min-w-0 flex-1"><div class="truncate text-sm text-foreground">{t.title}</div><div class="truncate text-xs text-muted-foreground">{t.artist}</div></div>
													<span class="shrink-0 text-xs text-muted-foreground">{formatDuration(t.duration)}</span>
												</button>
												<button title="Download this track" onclick={() => startDownload(tidalUrl('track', t.id), { resource: t })} class="absolute right-2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent-cyan"><Download class="size-4" /></button>
											</div>
										{/each}
									</div>
								{:else}
									<p class="text-xs text-muted-foreground">No top tracks available.</p>
								{/if}
								{#if resource?.albums?.length}
									<div class="pt-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Albums</div>
									<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
										{#each resource.albums as a (a.id)}
											<button onclick={() => pickAlbum(a)} title={a.title} class="group flex flex-col gap-1 rounded-lg p-1.5 text-left hover:bg-foreground/10">
												{#if a.cover_url}
													<img src={a.cover_url} alt="" class="aspect-square w-full rounded-md object-cover" />
												{:else}
													<div class="grid aspect-square w-full place-items-center rounded-md bg-foreground/5"><Disc3 class="size-6 text-muted-foreground/50" /></div>
												{/if}
												<div class="truncate text-xs text-foreground">{a.title}</div>
												{#if a.year}<div class="text-[10px] text-muted-foreground">{a.year}</div>{/if}
											</button>
										{/each}
									</div>
								{/if}
							</div>
						{:else if trackMeta.length}
						<div class="mt-4 grid grid-cols-2 gap-2 overflow-y-auto pr-1">
							{#each trackMeta as [k, v, wide] (k)}
								<div class="group relative rounded-lg border border-foreground/5 bg-foreground/5 px-3 py-2 {wide ? 'col-span-2' : ''}" oncontextmenu={(e) => { e.preventDefault(); copyText(v); }} role="presentation">
									<div class="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{k}</div>
									<div class="truncate pr-5 text-sm text-foreground" title={v}>{v}</div>
									<button onclick={() => copyText(v)} title="Copy" aria-label="Copy {k}" class="absolute top-1.5 right-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"><Copy class="size-3.5" /></button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			{#if player.path}
				<div class="mt-3 flex flex-col gap-1.5 border-t border-foreground/10 pt-3">
					<div class="flex items-center gap-3">
						<button onclick={() => player.toggle()} title={player.playing ? 'Pause' : 'Play'} aria-label={player.playing ? 'Pause' : 'Play'} class="text-foreground hover:text-accent-cyan">
							{#if player.playing}<Pause class="size-5" />{:else}<Play class="size-5" />{/if}
						</button>
						<button onclick={() => player.setMuted(!player.muted)} title={player.muted ? 'Unmute' : 'Mute'} aria-label={player.muted ? 'Unmute' : 'Mute'} class="text-muted-foreground hover:text-foreground">
							{#if player.muted}<VolumeX class="size-4" />{:else}<Volume2 class="size-4" />{/if}
						</button>
						<span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">{player.title}</span>
						<span class="text-xs text-muted-foreground tabular-nums">{formatDuration(player.currentTime)} / {formatDuration(player.duration)}</span>
					</div>
					{#if player.analyzing}
						<div class="flex h-11 items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 class="size-4 animate-spin text-accent-cyan" /> Analyzing waveform…</div>
					{:else}
						<WaveformSeek />
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>

<svelte:window onkeydown={() => coverOpen && (coverOpen = false)} />

<!-- cover lightbox -->
{#if coverOpen && cover}
	<div class="fixed inset-0 z-[100] grid place-items-center bg-black/85 p-10 backdrop-blur-sm" onclick={() => (coverOpen = false)} role="presentation" transition:fade={{ duration: 160 }}>
		<img src={hiRes(cover)} alt="" class="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl ring-1 ring-white/10" onclick={(e) => e.stopPropagation()} role="presentation" transition:scale={{ start: 0.9, opacity: 0, duration: 220, easing: cubicOut }} />
		<button onclick={() => (coverOpen = false)} aria-label="Close" class="absolute top-5 right-5 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"><X class="size-5" /></button>
		<button onclick={(e) => { e.stopPropagation(); downloadCover(); }} class="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm text-white backdrop-blur hover:bg-white/25"><Download class="size-4" /> Download image</button>
	</div>
{/if}
