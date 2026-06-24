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
	muted = $state(false);
	volume = $state(1); // linear 0..1, always defaults to max
	currentTime = $state(0);
	duration = $state(0);
	analysis = $state<AudioAnalysis | null>(null);
	analyzing = $state(false);
	// streaming = playing a remote Tidal preview (not a downloaded file)
	streaming = $state(false);
	streamLoading = $state(false);
	/** Called when a track finishes — used to advance a play-all queue. */
	onEnded: (() => void) | null = null;

	#audio: HTMLAudioElement | null = null;
	#token = 0;
	#cache = new Map<string, AudioAnalysis>(); // path → analysis (avoid re-decoding)

	#ensure(): HTMLAudioElement {
		if (this.#audio) return this.#audio;
		const a = new Audio();
		a.loop = false; // play once; don't loop at the end
		a.addEventListener('timeupdate', () => (this.currentTime = a.currentTime));
		a.addEventListener('durationchange', () => (this.duration = a.duration || this.duration));
		a.addEventListener('play', () => (this.playing = true));
		a.addEventListener('pause', () => (this.playing = false));
		a.addEventListener('ended', () => {
			this.playing = false;
			this.onEnded?.();
		});
		this.#audio = a;
		this.#applyVolume();
		return a;
	}

	#applyVolume() {
		if (this.#audio) this.#audio.volume = this.muted ? 0 : this.volume;
	}

	/** Linear volume from a 0..1 slider; sliding to 0 mutes, up unmutes. */
	setVolume(v: number) {
		this.volume = Math.max(0, Math.min(1, v));
		this.muted = this.volume === 0;
		this.#applyVolume();
	}

	/** Set/clear the analysis for a streamed preview once peaks arrive. */
	setStreamAnalysis(a: AudioAnalysis) {
		if (!this.streaming) return;
		this.analysis = a;
		if (!this.duration && a.duration) this.duration = a.duration;
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

	/** Mark that a preview is being fetched (URL not ready yet). */
	beginStream(title = '') {
		const a = this.#ensure();
		this.#token++;
		a.pause();
		this.playing = false;
		this.streaming = true;
		this.streamLoading = true;
		this.title = title;
		this.analysis = null;
		this.currentTime = 0;
		this.duration = 0;
	}

	/** Play a remote Tidal stream URL (preview) — no waveform analysis, autoplays. */
	stream(url: string, title = '') {
		const a = this.#ensure();
		this.#token++; // invalidate any in-flight local-file analysis
		this.streaming = true;
		this.streamLoading = false;
		this.analyzing = false;
		this.analysis = null;
		this.path = url; // marks "something is loaded" for the UI
		this.title = title || this.title;
		this.currentTime = 0;
		this.duration = 0;
		a.src = url; // remote URL, played directly (no convertFileSrc)
		this.#applyVolume();
		a.play().catch(() => {});
	}

	async load(path: string, title = '') {
		if (!PlayerStore.isAudio(path)) return;
		const a = this.#ensure();
		const token = ++this.#token;
		a.pause(); // reset transport so the play/pause icon isn't stuck
		this.playing = false;
		this.streaming = false;
		this.streamLoading = false;
		this.path = path;
		this.title = title;
		this.analysis = null;
		this.currentTime = 0;
		this.duration = 0;

		const src = convertFileSrc(path);
		a.src = src;
		this.#applyVolume();
		// No autoplay — the user presses play. Waveform shows once analyzed.

		// Reuse a cached analysis (same session) instead of decoding again.
		const cached = this.#cache.get(path);
		if (cached) {
			this.analysis = cached;
			this.duration = cached.duration;
			this.analyzing = false;
			return;
		}

		this.analysis = null;
		this.analyzing = true;
		try {
			const analysis = await analyzeFile(src);
			if (token === this.#token) {
				this.analysis = analysis;
				if (!this.duration) this.duration = analysis.duration;
				this.#cache.set(path, analysis);
			}
		} catch {
			/* visualizer falls back to idle lines */
		} finally {
			if (token === this.#token) this.analyzing = false;
		}
	}

	clearCache() {
		this.#cache.clear();
	}

	toggle() {
		const a = this.#audio;
		if (!a) return;
		if (a.paused) a.play().catch(() => {});
		else a.pause();
	}

	setMuted(m: boolean) {
		this.muted = m;
		if (!m && this.volume === 0) this.volume = 1; // unmuting from zero restores full
		this.#applyVolume();
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
		this.streaming = false;
		this.streamLoading = false;
		this.currentTime = 0;
		this.duration = 0;
	}
}

export const player = new PlayerStore();
