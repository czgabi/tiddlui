// Transient UI state: panels, engine status, toasts, platform.

import type { FfmpegStatus } from '$lib/types';

class UiStore {
	queueOpen = $state(true);
	settingsOpen = $state(false);
	engineReady = $state(false);
	ffmpeg = $state<FfmpegStatus | null>(null);
	toast = $state<{ message: string; kind: 'info' | 'error' } | null>(null);
	// bumped on every notify so the toast re-mounts and its enter animation replays
	toastSeq = $state(0);
	#toastTimer: ReturnType<typeof setTimeout> | undefined;
	isMac = $state(false);
	// pending "file already exists" prompt from the engine
	duplicate = $state<{ job_id: string; name: string } | null>(null);

	get mod(): string {
		return this.isMac ? '⌘' : 'Ctrl';
	}

	notify(message: string, kind: 'info' | 'error' = 'info') {
		// One toast, one timer: spamming just resets the countdown + replays the
		// animation instead of stacking or clearing early.
		this.toast = { message, kind };
		this.toastSeq++;
		clearTimeout(this.#toastTimer);
		this.#toastTimer = setTimeout(() => (this.toast = null), 2200);
	}
}

export const ui = new UiStore();
