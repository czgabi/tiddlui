<script lang="ts">
	import { Disc3, Music2, ListMusic, User, Play, Pause, Volume2, VolumeX, Download, BadgeCheck } from '@lucide/svelte';
	import WaveformSeek from '$lib/components/WaveformSeek.svelte';
	import { downloads } from '$lib/stores/download.svelte';
	import { player } from '$lib/stores/player.svelte';
	import { engine } from '$lib/ipc/commands';
	import { startDownload } from '$lib/queue';
	import { formatDuration } from '$lib/format';
	import { tidalUrl } from '$lib/url';
	import type { Resource } from '$lib/types';

	const resource = $derived<Resource | null>(downloads.selected);
	const cover = $derived(resource?.cover_url ?? null);
	const isCollection = $derived(resource?.kind === 'album' || resource?.kind === 'playlist');
	const iconFor = { track: Music2, album: Disc3, playlist: ListMusic, artist: User };

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

	const headline = $derived.by(() => {
		if (!resource) return [];
		const p: string[] = [];
		if (resource.year) p.push(String(resource.year));
		if (resource.number_of_tracks) p.push(`${resource.number_of_tracks} tracks`);
		if (resource.duration) p.push(formatDuration(resource.duration));
		return p;
	});

	// label/value pairs for the single-track metadata grid
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
		downloads.selected = t;
		downloads.url = tidalUrl('track', t.id);
	}
</script>

<div class="glass relative flex h-full flex-col overflow-hidden">
	<!-- blurred cover as an artistic background filler -->
	{#if cover}
		<img src={cover} alt="" class="absolute inset-0 size-full scale-125 object-cover opacity-25 blur-3xl" />
		<div class="absolute inset-0 bg-gradient-to-t from-background/90 via-background/65 to-background/45"></div>
	{/if}

	<div class="relative z-10 flex min-h-0 flex-1 flex-col p-5">
		{#if !resource && !player.path}
			<div class="flex h-full flex-col items-center justify-center gap-3 text-center">
				<Disc3 class="size-16 text-muted-foreground/40" />
				<h2 class="text-lg font-semibold text-muted-foreground">Nothing loaded</h2>
				<p class="max-w-xs text-sm text-muted-foreground/70">
					Search or paste a Tidal link above. Downloaded tracks play here with a seekable waveform.
				</p>
			</div>
		{:else}
			<div class="flex min-h-0 flex-1 gap-5">
				<!-- cover -->
				<div class="flex w-48 shrink-0 flex-col gap-3">
					<div class="relative aspect-square w-48 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10">
						{#if cover}
							<img src={cover} alt="" class="size-full object-cover" />
						{:else}
							{@const Icon = iconFor[resource?.kind ?? 'album']}
							<div class="grid size-full place-items-center bg-white/5">
								<Icon class="size-14 text-muted-foreground/50" />
							</div>
						{/if}
					</div>
					{#if resource?.audio_quality}
						<span class="inline-flex items-center gap-1.5 self-start rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-accent-cyan">
							<BadgeCheck class="size-3.5" />{resource.audio_quality}
						</span>
					{/if}
				</div>

				<!-- info -->
				<div class="flex min-w-0 flex-1 flex-col">
					<h2 class="truncate text-2xl font-semibold text-foreground" title={resource?.title}>
						{resource?.title ?? player.title}
					</h2>
					<p class="truncate text-sm text-muted-foreground">{resource?.artist ?? ''}</p>
					{#if headline.length}
						<p class="mt-1 text-xs text-muted-foreground/70">{headline.join('  •  ')}</p>
					{/if}

					{#if isCollection}
						<div class="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
							{#if downloads.tracklist.length === 0}
								<p class="text-xs text-muted-foreground/60">Loading tracks…</p>
							{/if}
							{#each downloads.tracklist as t, i (t.id)}
								<div class="group relative flex items-center gap-3 rounded-md pr-8 hover:bg-white/5">
									<button onclick={() => pickTrack(t)} class="flex min-w-0 flex-1 items-center gap-3 px-2 py-1.5 text-left">
										<span class="w-5 shrink-0 text-right text-xs text-muted-foreground/60">{i + 1}</span>
										<div class="min-w-0 flex-1">
											<div class="truncate text-sm text-foreground">{t.title}</div>
											<div class="truncate text-xs text-muted-foreground">{t.artist}</div>
										</div>
										<span class="shrink-0 text-xs text-muted-foreground/60">{formatDuration(t.duration)}</span>
									</button>
									<button title="Download this track" onclick={() => startDownload(tidalUrl('track', t.id), { resource: t })} class="absolute right-2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent-cyan">
										<Download class="size-4" />
									</button>
								</div>
							{/each}
						</div>
					{:else if trackMeta.length}
						<div class="mt-4 grid grid-cols-2 gap-2 overflow-y-auto pr-1">
							{#each trackMeta as [k, v, wide] (k)}
								<div class="rounded-lg border border-white/5 bg-white/5 px-3 py-2 {wide ? 'col-span-2' : ''}">
									<div class="text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase">{k}</div>
									<div class="truncate text-sm text-foreground" title={v}>{v}</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- player transport -->
		{#if player.path}
			<div class="mt-3 flex flex-col gap-1.5 border-t border-white/10 pt-3">
				<div class="flex items-center gap-3">
					<button onclick={() => player.toggle()} title={player.playing ? 'Pause' : 'Play'} aria-label={player.playing ? 'Pause' : 'Play'} class="text-foreground hover:text-accent-cyan">
						{#if player.playing}<Pause class="size-5" />{:else}<Play class="size-5" />{/if}
					</button>
					<button onclick={() => player.setMuted(!player.muted)} title={player.muted ? 'Unmute' : 'Mute'} aria-label={player.muted ? 'Unmute' : 'Mute'} class="text-muted-foreground hover:text-foreground">
						{#if player.muted}<VolumeX class="size-4" />{:else}<Volume2 class="size-4" />{/if}
					</button>
					<span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">{player.title}</span>
					<span class="text-xs text-muted-foreground tabular-nums">
						{formatDuration(player.currentTime)} / {formatDuration(player.duration)}
					</span>
				</div>
				<WaveformSeek />
			</div>
		{/if}
	</div>
</div>
