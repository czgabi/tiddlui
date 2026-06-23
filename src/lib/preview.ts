// Stream a track straight from Tidal for in-app preview — listen before you
// download. Requests a playable stream URL from the engine, then hands it to
// the player; no file is written to disk.

import { engine } from '$lib/ipc/commands';
import { player } from '$lib/stores/player.svelte';
import { ui } from '$lib/stores/ui.svelte';
import type { Resource } from '$lib/types';

let reqId = 0;
let pending: { id: number; title: string } | null = null;

/** Start (or restart) a preview of the given track. */
export function previewTrack(t: Resource) {
	const title = [t.artist, t.title].filter(Boolean).join(' — ') || t.title;
	pending = { id: ++reqId, title };
	player.beginStream(title);
	engine.stream(String(t.id), reqId);
}

/** Routed from the engine "stream_url" event. */
export function onStreamUrl(ev: { request_id?: number; url?: string; error?: string; [k: string]: unknown }) {
	if (!pending || ev.request_id !== pending.id) return; // stale / superseded
	const { title } = pending;
	pending = null;
	if (ev.url) {
		player.stream(ev.url, title);
	} else {
		player.unload();
		ui.notify('Could not stream this track', 'error');
	}
}
