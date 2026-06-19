// Offline waveform analysis: decode a file once and precompute an amplitude
// envelope used by the seek bar. (FFT spectrogram was removed — too heavy and
// not worth it visually.)

export interface AudioAnalysis {
	duration: number;
	peaks: number[]; // 0..1 amplitude envelope
}

const FRAMES = 150;

let ctx: AudioContext | null = null;
function audioContext(): AudioContext {
	ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
	return ctx;
}

export async function analyzeFile(url: string): Promise<AudioAnalysis> {
	const res = await fetch(url);
	const bytes = await res.arrayBuffer();
	const buffer = await audioContext().decodeAudioData(bytes);

	// mono mix
	const len = buffer.length;
	const mono = new Float32Array(len);
	for (let c = 0; c < buffer.numberOfChannels; c++) {
		const data = buffer.getChannelData(c);
		for (let i = 0; i < len; i++) mono[i] += data[i];
	}
	const inv = 1 / Math.max(1, buffer.numberOfChannels);
	for (let i = 0; i < len; i++) mono[i] *= inv;

	return { duration: buffer.duration, peaks: computePeaks(mono) };
}

function computePeaks(mono: Float32Array): number[] {
	const step = Math.floor(mono.length / FRAMES) || 1;
	const peaks: number[] = [];
	let max = 1e-6;
	for (let f = 0; f < FRAMES; f++) {
		let sum = 0;
		const start = f * step;
		for (let i = 0; i < step; i++) {
			const s = mono[start + i] || 0;
			sum += s * s;
		}
		const rms = Math.sqrt(sum / step);
		peaks.push(rms);
		if (rms > max) max = rms;
	}
	// normalize with mild compression so quiet tracks still read well
	const norm = peaks.map((p) => Math.min(1, Math.pow(p / max, 0.8)));
	// smooth with a small moving average so the curve has no sharp spikes
	return norm.map((_, i) => {
		const a = norm[i - 1] ?? norm[i];
		const c = norm[i + 1] ?? norm[i];
		return (a + norm[i] * 2 + c) / 4;
	});
}
