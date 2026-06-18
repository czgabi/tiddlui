// Routes engine stdout events (forwarded by Rust on the "engine" channel) into
// the Svelte stores, and primes initial state once the listeners are attached.

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow, UserAttentionType } from '@tauri-apps/api/window';
import {
	isPermissionGranted,
	requestPermission,
	sendNotification
} from '@tauri-apps/plugin-notification';

import { engine } from '$lib/ipc/commands';
import { auth } from '$lib/stores/auth.svelte';
import { downloads } from '$lib/stores/download.svelte';
import { player } from '$lib/stores/player.svelte';
import { search } from '$lib/stores/search.svelte';
import { settings } from '$lib/stores/settings.svelte';
import { ui } from '$lib/stores/ui.svelte';
import type { JobStatus, QueueItem } from '$lib/types';

type EngineEvent = { type: string; [k: string]: any };

function route(ev: EngineEvent) {
	switch (ev.type) {
		case 'ready':
			ui.engineReady = true;
			break;
		case 'auth_status':
			auth.setStatus(ev.logged_in, ev.user ?? null, ev.country_code ?? null);
			break;
		case 'login_pending':
			auth.startPending(ev.verification_url, ev.user_code, ev.expires_in);
			break;
		case 'login_expired':
			auth.pending = false;
			auth.error = 'Login timed out — try again.';
			break;
		case 'login_error':
			auth.pending = false;
			auth.error = ev.message ?? 'Login failed.';
			break;
		case 'search_results':
			if (ev.request_id === search.requestId) {
				search.results = {
					tracks: ev.tracks ?? [],
					albums: ev.albums ?? [],
					playlists: ev.playlists ?? [],
					artists: ev.artists ?? [],
					top_hit: ev.top_hit ?? null
				};
				search.loading = false;
				search.open = true;
			}
			break;
		case 'resolved':
			downloads.selected = ev.resource;
			break;
		case 'tracklist':
			if (ev.url === downloads.tracklistUrl) downloads.tracklist = ev.tracks ?? [];
			break;
		case 'job_update':
			handleJob(ev);
			break;
		case 'ffmpeg_status':
			ui.ffmpeg = { state: ev.state, progress: ev.progress, message: ev.message };
			break;
		case 'error':
			ui.notify(ev.message ?? 'Engine error', 'error');
			search.loading = false;
			break;
		case 'log':
			if (ev.level === 'error') console.error('[engine]', ev.message);
			else console.debug('[engine]', ev.message);
			break;
	}
}

function handleJob(ev: EngineEvent) {
	const patch: Partial<QueueItem> = { status: ev.status as JobStatus };
	if (ev.progress !== undefined) patch.progress = ev.progress;
	if (ev.resource !== undefined) patch.resource = ev.resource;
	if (ev.current_title !== undefined) patch.current_title = ev.current_title;
	if (ev.current_artist !== undefined) patch.current_artist = ev.current_artist;
	if (ev.cover_url !== undefined) patch.cover_url = ev.cover_url;
	if (ev.speed_bps !== undefined) patch.speed_bps = ev.speed_bps;
	if (ev.quality_label !== undefined) patch.quality_label = ev.quality_label;
	if (ev.completed !== undefined) patch.completed = ev.completed;
	if (ev.total !== undefined) patch.total = ev.total;
	if (ev.path !== undefined) patch.path = ev.path;
	if (ev.message !== undefined) patch.message = ev.message;

	downloads.update(ev.job_id, patch);

	if (ev.status === 'complete') {
		const item = downloads.items.find((i) => i.id === ev.job_id);
		announceDone(item);
		// Load the finished track into the player so its waveform comes alive.
		if (ev.path) player.load(ev.path, item?.resource?.title ?? item?.current_title ?? '');
	} else if (ev.status === 'error') {
		ui.notify(`Download failed: ${ev.message ?? 'unknown error'}`, 'error');
	}
}

async function announceDone(item?: QueueItem) {
	if (!settings.notify_on_complete || !item) return;
	const title = item.resource?.title ?? item.current_title ?? 'Download';

	// 1. in-app popup
	ui.notify(`Downloaded: ${title}`);

	// 2. flash the taskbar icon
	try {
		await getCurrentWindow().requestUserAttention(UserAttentionType.Critical);
	} catch {
		/* not supported everywhere */
	}

	// 3. OS notification
	try {
		let granted = await isPermissionGranted();
		if (!granted) granted = (await requestPermission()) === 'granted';
		if (granted) sendNotification({ title: 'Download complete', body: title });
	} catch {
		/* best-effort */
	}
}

/** Attach listeners and prime current engine state. Returns an unlisten fn. */
export async function initEngine(): Promise<UnlistenFn> {
	const unlisten = await listen<EngineEvent>('engine', (e) => route(e.payload));

	// Startup events may have fired before we attached — pull current state.
	await engine.ping().catch(() => {});
	await engine.authStatus().catch(() => {});
	ui.engineReady = true;

	return unlisten;
}
