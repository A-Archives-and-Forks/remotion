import type {EncodedPacketSink, VideoSampleSink} from 'mediabunny';
import {getFramesSinceKeyframe} from './get-frames-since-keyframe';
import {type KeyframeBank} from './keyframe-bank';
import type {LogLevel} from './log';
import {Log} from './log';

export const makeKeyframeManager = () => {
	// src => {[startTimestampInSeconds]: KeyframeBank
	const sources: Record<string, Record<number, Promise<KeyframeBank>>> = {};

	const addKeyframeBank = ({
		src,
		bank,
		startTimestampInSeconds,
	}: {
		src: string;
		bank: Promise<KeyframeBank>;
		startTimestampInSeconds: number;
	}) => {
		sources[src] = sources[src] ?? {};
		sources[src][startTimestampInSeconds] = bank;
	};

	const logCacheStats = async (logLevel: LogLevel) => {
		let count = 0;
		for (const src in sources) {
			for (const bank in sources[src]) {
				const v = await sources[src][bank];
				count += v.getOpenFrameCount();
			}
		}

		Log.verbose(logLevel, `Cache stats: ${count} open frames`);
	};

	const clearKeyframeBanksBeforeTime = async ({
		timestampInSeconds,
		src,
		logLevel,
	}: {
		timestampInSeconds: number;
		src: string;
		logLevel: LogLevel;
	}) => {
		// TODO: make it dependent on the fps and concurrency
		const SAFE_BACK_WINDOW_IN_SECONDS = 1;
		const threshold = timestampInSeconds - SAFE_BACK_WINDOW_IN_SECONDS;

		// TODO: Delete banks of other sources

		if (!sources[src]) {
			return;
		}

		const banks = Object.keys(sources[src]);

		for (const startTimeInSeconds of banks) {
			const bank = await sources[src][startTimeInSeconds as unknown as number];
			const {endTimestampInSeconds} = await bank;

			if (endTimestampInSeconds < threshold) {
				bank.prepareForDeletion();
				Log.verbose(
					logLevel,
					`Cleared frames for src ${src} from ${bank.startTimestampInSeconds}sec to ${bank.endTimestampInSeconds}sec`,
				);
				delete sources[src][startTimeInSeconds as unknown as number];
			} else {
				bank.deleteFramesBeforeTimestamp(threshold, logLevel, src);
			}
		}

		await logCacheStats(logLevel);
	};

	const getKeyframeBankOrRefetch = async ({
		packetSink,
		timestamp,
		videoSampleSink,
		src,
		logLevel,
	}: {
		packetSink: EncodedPacketSink;
		timestamp: number;
		videoSampleSink: VideoSampleSink;
		src: string;
		logLevel: LogLevel;
	}) => {
		const startPacket = await packetSink.getKeyPacket(timestamp, {
			verifyKeyPackets: true,
		});

		if (!startPacket) {
			throw new Error(`No key packet found for timestamp ${timestamp}`);
		}

		const startTimestampInSeconds = startPacket.timestamp;
		const existingBank = sources[src]?.[startTimestampInSeconds];

		// Bank does not yet exist, we need to fetch
		if (!existingBank) {
			const newKeyframeBank = getFramesSinceKeyframe({
				packetSink,
				videoSampleSink,
				startPacket,
			});

			addKeyframeBank({src, bank: newKeyframeBank, startTimestampInSeconds});

			return newKeyframeBank;
		}

		// Bank exists and still has the frame we want
		if (await (await existingBank).hasTimestampInSecond(timestamp)) {
			return existingBank;
		}

		Log.verbose(logLevel, `Bank exists but frames have already been evicted!`);

		// Bank exists but frames have already been evicted!
		// First delete it entirely
		(await existingBank).prepareForDeletion();
		delete sources[src][startTimestampInSeconds];

		// Then refetch
		const replacementKeybank = getFramesSinceKeyframe({
			packetSink,
			videoSampleSink,
			startPacket,
		});

		addKeyframeBank({src, bank: replacementKeybank, startTimestampInSeconds});

		return replacementKeybank;
	};

	const requestKeyframeBank = async ({
		packetSink,
		timestamp,
		videoSampleSink,
		src,
		logLevel,
	}: {
		timestamp: number;
		packetSink: EncodedPacketSink;
		videoSampleSink: VideoSampleSink;
		src: string;
		logLevel: LogLevel;
	}) => {
		await clearKeyframeBanksBeforeTime({
			timestampInSeconds: timestamp,
			src,
			logLevel,
		});

		const keyframeBank = await getKeyframeBankOrRefetch({
			packetSink,
			timestamp,
			videoSampleSink,
			src,
			logLevel,
		});

		return keyframeBank;
	};

	return {
		requestKeyframeBank,
		addKeyframeBank,
	};
};

export type KeyframeManager = Awaited<ReturnType<typeof makeKeyframeManager>>;
