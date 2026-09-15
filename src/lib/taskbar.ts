// Download progress on the taskbar icon, so it's readable while the window is
// minimised. Windows draws it into the taskbar button; on Linux it goes through
// the Unity dbus protocol, which several desktops implement and the rest ignore.

import { getCurrentWindow, ProgressBarStatus } from '@tauri-apps/api/window';

// The queue updates several times a second; the taskbar only has whole
// percents, so only push when the rendered value actually changes.
let lastKey = '';

export async function showDownloadProgress(running: number, queued: number, fraction: number) {
	let status = ProgressBarStatus.Normal;
	if (running + queued === 0) status = ProgressBarStatus.None;
	else if (running === 0) status = ProgressBarStatus.Indeterminate; // queued, nothing moving yet

	const progress = Math.max(0, Math.min(100, Math.round(fraction * 100)));
	const key = `${status}:${status === ProgressBarStatus.Normal ? progress : 0}`;
	if (key === lastKey) return;
	lastKey = key;

	try {
		await getCurrentWindow().setProgressBar({ status, progress });
	} catch {
		/* desktop doesn't support it — the app is unaffected */
	}
}
