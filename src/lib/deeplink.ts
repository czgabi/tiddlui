// tiddlui:// links. Opening one loads that resource in the running app rather
// than starting a second copy.
//
//   tiddlui://album/1781800
//   tiddlui://https%3A%2F%2Flisten.tidal.com%2Ftrack%2F12345
//
// Two delivery routes: the deep-link plugin reports URLs the app was launched
// with or receives while running, and the single-instance handler in lib.rs
// forwards anything a second launch carried.

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';

import { engine } from '$lib/ipc/commands';
import { auth } from '$lib/stores/auth.svelte';
import { downloads } from '$lib/stores/download.svelte';
import { search } from '$lib/stores/search.svelte';
import { ui } from '$lib/stores/ui.svelte';
import { parseTidalResource, tidalUrl } from '$lib/url';

/** Turn a tiddlui:// link into a Tidal URL, or null if it isn't one. */
function toTidalUrl(raw: string): string | null {
	let text = raw.trim().replace(/^tiddlui:\/\//i, '');
	try {
		text = decodeURIComponent(text);
	} catch {
		/* not encoded */
	}
	// Only the kind and id are kept, so a link can't smuggle in a foreign host:
	// whatever arrives is rebuilt as a canonical Tidal URL or rejected.
	const res = parseTidalResource(text);
	return res ? tidalUrl(res.kind, res.id) : null;
}

function open(raw: string) {
	const target = toTidalUrl(raw);
	if (!target) {
		ui.notify('That link does not point at a Tidal track, album, playlist or artist.', 'error');
		return;
	}
	search.query = target;
	downloads.url = target;
	if (auth.loggedIn) engine.resolve(target, ++search.requestId);
}

/** Start listening. Returns a cleanup function. */
export async function initDeepLinks(): Promise<UnlistenFn> {
	// URLs this launch was started with (clicking a link while the app is closed).
	try {
		for (const url of (await getCurrent()) ?? []) open(url);
	} catch {
		/* no deep link on this launch */
	}

	const stopPlugin = await onOpenUrl((urls) => urls.forEach(open)).catch(() => null);
	const stopForward = await listen<string>('deep-link', (e) => open(e.payload));

	return () => {
		stopPlugin?.();
		stopForward();
	};
}
