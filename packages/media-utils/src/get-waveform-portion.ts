import type {SampleOutputRange} from './get-wave-form-samples';
import {getWaveformSamples} from './get-wave-form-samples';
import type {AudioData} from './types';
import {validateChannel} from './validate-channel';

type Bar = {
	index: number;
	amplitude: number;
};

const concatArrays = (arrays: Float32Array[]): Float32Array => {
	// sum of individual array lengths
	const totalLength = arrays.reduce((acc, value) => acc + value.length, 0);

	const result = new Float32Array(totalLength);

	// for each array - copy it over result
	// next array is copied right after the previous one
	let length = 0;
	for (const array of arrays) {
		result.set(array, length);
		length += array.length;
	}

	return result;
};

type Truthy<T> = T extends false | '' | 0 | null | undefined ? never : T;

function truthy<T>(value: T): value is Truthy<T> {
	return Boolean(value);
}

/*
 * @description Takes bulky waveform data (for example fetched by getAudioData()) and returns a trimmed and simplified version of it, for simpler visualization
 * @see [Documentation](https://remotion.dev/docs/get-waveform-portion)
 */
export const getWaveformPortion = ({
	audioData,
	startTimeInSeconds,
	durationInSeconds,
	numberOfSamples,
	channel,
	outputRange = 'zero-to-one',
}: {
	audioData: AudioData;
	startTimeInSeconds: number;
	durationInSeconds: number;
	numberOfSamples: number;
	channel: number;
	outputRange?: SampleOutputRange;
}): Bar[] => {
	validateChannel(channel, audioData.numberOfChannels);

	const waveform = audioData.channelWaveforms[channel];

	const startSample = Math.floor(
		(startTimeInSeconds / audioData.durationInSeconds) * waveform.length,
	);
	const endSample = Math.floor(
		((startTimeInSeconds + durationInSeconds) / audioData.durationInSeconds) *
			waveform.length,
	);

	const samplesBeforeStart = 0 - startSample;
	const samplesAfterEnd = endSample - waveform.length;

	const clampedStart = Math.max(startSample, 0);
	const clampedEnd = Math.min(waveform.length, endSample);

	const padStart =
		samplesBeforeStart > 0
			? new Float32Array(samplesBeforeStart).fill(0)
			: null;
	const padEnd =
		samplesAfterEnd > 0 ? new Float32Array(samplesAfterEnd).fill(0) : null;
	const arrs = [
		padStart,
		waveform.slice(clampedStart, clampedEnd),
		padEnd,
	].filter(truthy);
	const audioBuffer = arrs.length === 1 ? arrs[0] : concatArrays(arrs);

	return getWaveformSamples({
		audioBuffer,
		numberOfSamples,
		outputRange,
	}).map((w, i) => {
		return {
			index: i,
			amplitude: w,
		};
	});
};

export {Bar};
