// Stream tracks straight from Tidal for in-app preview — listen before you
// download. Supports single-track preview and sequential "play all" for an
// album / playlist / artist's top tracks. Playback is live (nothing is written
// to disk and nothing is cached across tracks), so it can't bloat the system.

import { engine } from '$lib/ipc/commands';
import { player } from '$lib/stores/player.svelte';
import { ui } from '$lib/stores/ui.svelte';
import type { AudioAnalysis } from '$lib/audio';
import type { Resource } from '$lib/types';

let reqId = 0;
let playReqId = 0; // the request whose URL should play (and whose peaks we want)
let queue: Resource[] = [];
let qIndex = -1;

// In-memory waveform cache by track id, so re-previewing a track shows its
// waveform instantly (and skips the engine recompute). Cleared on app close —
// nothing touches disk, so it can't bloat the system.
const peaksCache = new Map<string, AudioAnalysis>();
const PEAKS_CACHE_MAX = 300;

function titleOf(t: Resource): string {
	return [t.artist, t.title].filter(Boolean).join(' — ') || t.title;
}

function startCurrent() {
	const t = queue[qIndex];
	if (!t) return;
	playReqId = ++reqId;
	player.beginStream(titleOf(t));
	engine.stream(String(t.id), playReqId, !peaksCache.has(String(t.id)));
}

/** When a track ends, advance to the next one in a play-all queue. */
function advance() {
	if (!player.streaming) return; // a downloaded file ended, not our queue
	if (qIndex >= 0 && qIndex < queue.length - 1) {
		qIndex++;
		startCurrent();
	}
}

/** Preview a single track. */
export function previewTrack(t: Resource) {
	queue = [t];
	qIndex = 0;
	player.onEnded = advance;
	startCurrent();
}

/** Play a collection from `start` to the end, one track after another. */
export function previewList(tracks: Resource[], start = 0) {
	queue = (tracks ?? []).filter((t) => t && t.id != null);
	if (!queue.length) return;
	qIndex = Math.max(0, Math.min(start, queue.length - 1));
	player.onEnded = advance;
	startCurrent();
}

/** Routed from the engine "stream_url" event. */
export function onStreamUrl(ev: { request_id?: number; url?: string; [k: string]: unknown }) {
	if (ev.request_id !== playReqId) return; // stale / superseded / a prefetch
	const t = queue[qIndex];
	if (ev.url) {
		player.stream(ev.url, t ? titleOf(t) : '');
		const cached = t ? peaksCache.get(String(t.id)) : undefined;
		if (cached) player.setStreamAnalysis(cached); // instant waveform on replay
	} else {
		player.unload();
		ui.notify('Could not stream this track', 'error');
	}
}

/** Routed from the engine "stream_peaks" event — gives the preview a waveform. */
export function onStreamPeaks(ev: {
	request_id?: number;
	peaks?: number[];
	duration?: number;
	[k: string]: unknown;
}) {
	if (ev.request_id !== playReqId || !ev.peaks) return;
	const analysis: AudioAnalysis = { peaks: ev.peaks, duration: ev.duration ?? 0 };
	const t = queue[qIndex];
	if (t) {
		if (peaksCache.size >= PEAKS_CACHE_MAX) peaksCache.delete(peaksCache.keys().next().value!);
		peaksCache.set(String(t.id), analysis);
	}
	player.setStreamAnalysis(analysis);
}
