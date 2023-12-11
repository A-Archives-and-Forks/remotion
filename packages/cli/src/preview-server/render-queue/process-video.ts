import type {LogLevel} from '@remotion/renderer';
import {getRendererPortFromConfigFile} from '../../config/preview-server';
import {convertEntryPointToServeUrl} from '../../convert-entry-point-to-serve-url';
import {getCliOptions} from '../../get-cli-options';
import {renderVideoFlow} from '../../render-flows/render';
import type {JobProgressCallback, RenderJob} from './job';

export const processVideoJob = async ({
	job,
	remotionRoot,
	entryPoint,
	onProgress,
	addCleanupCallback,
	logLevel,
}: {
	job: RenderJob;
	remotionRoot: string;
	entryPoint: string;
	onProgress: JobProgressCallback;
	addCleanupCallback: (cb: () => void) => void;
	logLevel: LogLevel;
}) => {
	if (job.type !== 'video' && job.type !== 'sequence') {
		throw new Error('Expected video job');
	}

	const {publicDir, browserExecutable, browser, ffmpegOverride} =
		await getCliOptions({
			isLambda: false,
			type: 'still',
			remotionRoot,
			logLevel,
		});
	const fullEntryPoint = convertEntryPointToServeUrl(entryPoint);
	await renderVideoFlow({
		remotionRoot,
		browser,
		browserExecutable,
		chromiumOptions: job.chromiumOptions,
		entryPointReason: 'same as Studio',
		envVariables: job.envVariables,
		height: null,
		fullEntryPoint,
		serializedInputPropsWithCustomSchema:
			job.serializedInputPropsWithCustomSchema,
		overwrite: true,
		port: getRendererPortFromConfigFile(),
		publicDir,
		puppeteerTimeout: job.delayRenderTimeout,
		jpegQuality: job.jpegQuality ?? undefined,
		remainingArgs: [],
		scale: job.scale,
		width: null,
		compositionIdFromUi: job.compositionId,
		logLevel: job.logLevel,
		onProgress,
		indent: true,
		concurrency: job.concurrency,
		everyNthFrame: job.type === 'video' ? job.everyNthFrame : 1,
		frameRange: [job.startFrame, job.endFrame],
		quiet: false,
		shouldOutputImageSequence: job.type === 'sequence',
		addCleanupCallback,
		outputLocationFromUI: job.outName,
		uiCodec: job.type === 'video' ? job.codec : null,
		uiImageFormat: job.imageFormat,
		cancelSignal: job.cancelToken.cancelSignal,
		crf: job.type === 'video' ? job.crf : null,
		ffmpegOverride,
		audioBitrate: job.type === 'video' ? job.audioBitrate : null,
		muted: job.type === 'video' ? job.muted : true,
		enforceAudioTrack: job.type === 'video' ? job.enforceAudioTrack : false,
		proResProfile:
			job.type === 'video' ? job.proResProfile ?? undefined : undefined,
		x264Preset: job.type === 'video' ? job.x264Preset ?? undefined : undefined,
		pixelFormat: job.type === 'video' ? job.pixelFormat : 'yuv420p',
		videoBitrate: job.type === 'video' ? job.videoBitrate : null,
		bufSize: job.type === 'video' ? job.bufSize : null,
		maxRate: job.type === 'video' ? job.maxRate : null,
		numberOfGifLoops: job.type === 'video' ? job.numberOfGifLoops : null,
		audioCodec: job.type === 'video' ? job.audioCodec : null,
		disallowParallelEncoding:
			job.type === 'video' ? job.disallowParallelEncoding : false,
		offthreadVideoCacheSizeInBytes: job.offthreadVideoCacheSizeInBytes,
		colorSpace: job.type === 'video' ? job.colorSpace : 'default',
	});
};
