// Loaded-track player. Drives the border visualizer. Plays the local file in a
// muted loop by default (gesture-free), so the waveform animates immediately;
// the FFT spectrum is precomputed so it animates too, even while muted.

import { convertFileSrc } from '@tauri-apps/api/core';
import { analyzeFile, type AudioAnalysis } from '$lib/audio';

const AUDIO_EXT = /\.(flac|m4a|mp3|wav|ogg|aac|opus)$/i;

class PlayerStore {
	path = $state<string | null>(null);
	title = $state('');
	playing = $state(false);
	muted = $state(true);
	currentTime = $state(0);
	duration = $state(0);
	analysis = $state<AudioAnalysis | null>(null);
	analyzing = $state(false);

	#audio: HTMLAudioElement | null = null;
	#token = 0;

	#ensure(): HTMLAudioElement {
		if (this.#audio) return this.#audio;
		const a = new Audio();
		a.loop = true;
		a.muted = this.muted;
		a.addEventListener('timeupdate', () => (this.currentTime = a.currentTime));
		a.addEventListener('durationchange', () => (this.duration = a.duration || this.duration));
		a.addEventListener('play', () => (this.playing = true));
		a.addEventListener('pause', () => (this.playing = false));
		this.#audio = a;
		return a;
	}

	static isAudio(path?: string | null): boolean {
		return !!path && AUDIO_EXT.test(path);
	}

	/** Live (per-frame accurate) playback position for the visualizer. */
	liveTime(): number {
		return this.#audio?.currentTime ?? this.currentTime;
	}

	get progress(): number {
		return this.duration ? this.liveTime() / this.duration : 0;
	}

	async load(path: string, title = '') {
		if (!PlayerStore.isAudio(path)) return;
		const a = this.#ensure();
		const token = ++this.#token;
		this.path = path;
		this.title = title;
		this.analysis = null;
		this.currentTime = 0;
		this.duration = 0;

		const src = convertFileSrc(path);
		a.src = src;
		a.muted = this.muted;
		a.play().catch(() => {}); // muted autoplay is permitted

		this.analyzing = true;
		try {
			const analysis = await analyzeFile(src);
			if (token === this.#token) {
				this.analysis = analysis;
				if (!this.duration) this.duration = analysis.duration;
			}
		} catch {
			/* visualizer falls back to idle lines */
		} finally {
			if (token === this.#token) this.analyzing = false;
		}
	}

	toggle() {
		const a = this.#audio;
		if (!a) return;
		if (a.paused) a.play().catch(() => {});
		else a.pause();
	}

	setMuted(m: boolean) {
		this.muted = m;
		if (this.#audio) {
			this.#audio.muted = m;
			if (!m) this.#audio.play().catch(() => {});
		}
	}

	/** Seek to a fraction (0..1). Updates currentTime optimistically so the UI
	 *  tracks the cursor in real time while scrubbing. */
	scrub(frac: number) {
		const a = this.#audio;
		if (!a || !this.duration) return;
		const t = Math.max(0, Math.min(1, frac)) * this.duration;
		a.currentTime = t;
		this.currentTime = t;
	}

	unload() {
		this.#token++;
		this.#audio?.pause();
		if (this.#audio) this.#audio.src = '';
		this.path = null;
		this.title = '';
		this.analysis = null;
		this.playing = false;
		this.currentTime = 0;
		this.duration = 0;
	}
}

export const player = new PlayerStore();
