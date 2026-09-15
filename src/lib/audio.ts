// Offline waveform analysis: decode a downloaded file once and precompute the
// amplitude envelope the seek bar draws.
//
// Must stay visually consistent with the engine's compute_stream_peaks(), which
// does the same job for streamed previews — same frame count, same peak (not
// RMS) envelope, same normalisation.

export interface AudioAnalysis {
	duration: number;
	peaks: number[]; // 0..1 amplitude envelope
}

const FRAMES = 400;

// decodeAudioData resamples to the context's rate, so decoding at a low rate is
// what keeps this cheap. At the native 44.1 kHz a six-minute track expands to
// ~127 MB of Float32 (and a 24-bit/96 kHz one to roughly half a gigabyte)
// before we throw all of it away to draw a few hundred points.
const ANALYSIS_RATE = 8000;

let ctx: AudioContext | null = null;
function audioContext(): AudioContext {
	if (ctx) return ctx;
	const Ctor = window.AudioContext || (window as any).webkitAudioContext;
	try {
		ctx = new Ctor({ sampleRate: ANALYSIS_RATE });
	} catch {
		ctx = new Ctor(); // browser refused the rate — correct, just heavier
	}
	return ctx;
}

export async function analyzeFile(url: string): Promise<AudioAnalysis> {
	const res = await fetch(url);
	const bytes = await res.arrayBuffer();
	const buffer = await audioContext().decodeAudioData(bytes);

	// Mix to mono in place on the first channel's copy.
	const len = buffer.length;
	const mono = new Float32Array(len);
	const channels = buffer.numberOfChannels;
	for (let c = 0; c < channels; c++) {
		const data = buffer.getChannelData(c);
		for (let i = 0; i < len; i++) mono[i] += data[i];
	}
	if (channels > 1) {
		const inv = 1 / channels;
		for (let i = 0; i < len; i++) mono[i] *= inv;
	}

	return { duration: buffer.duration, peaks: computePeaks(mono) };
}

/** Peak (max absolute sample) per bucket — sharper than an RMS average, and
 *  the same shape the engine produces for previews. */
function computePeaks(mono: Float32Array): number[] {
	const step = Math.floor(mono.length / FRAMES) || 1;
	const peaks: number[] = new Array(FRAMES);
	let loudest = 1e-6;

	for (let f = 0; f < FRAMES; f++) {
		const start = f * step;
		const end = Math.min(start + step, mono.length);
		let amp = 0;
		for (let i = start; i < end; i++) {
			const v = mono[i] < 0 ? -mono[i] : mono[i];
			if (v > amp) amp = v;
		}
		peaks[f] = amp;
		if (amp > loudest) loudest = amp;
	}

	// Normalise with mild compression so quiet tracks still read. No smoothing
	// pass — the seek bar already draws a smoothed curve through these points.
	return peaks.map((p) => Math.min(1, Math.pow(p / loudest, 0.85)));
}
