import {type Size} from '@remotion/player';
import React, {
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from 'react';
import {TIMELINE_BACKGROUND} from '../../helpers/colors';
import {getRulerPoints, getRulerScaleRange} from '../../helpers/editor-ruler';
import type {AssetMetadata} from '../../helpers/get-asset-metadata';
import type {Dimensions} from '../../helpers/is-current-selected-still';
import {useStudioCanvasDimensions} from '../../helpers/use-studio-canvas-dimensions';
import {EditorShowGuidesContext} from '../../state/editor-guides';
import {
	MAXIMUM_PREDEFINED_RULER_SCALE_GAP,
	MINIMUM_RULER_MARKING_GAP_PX,
	PREDEFINED_RULER_SCALE_GAPS,
	RULER_WIDTH,
} from '../../state/editor-rulers';
import Ruler from './Ruler';

const originBlockStyles: React.CSSProperties = {
	position: 'absolute',
	top: 0,
	left: 0,
	borderBottom: '1px solid #444444',
	borderRight: '1px solid #444444',
	width: `${RULER_WIDTH}px`,
	height: `${RULER_WIDTH}px`,
	background: TIMELINE_BACKGROUND,
};

export const EditorRulers: React.FC<{
	canvasSize: Size | null;
	contentDimensions: Dimensions | 'none' | null;
	assetMetadata: AssetMetadata | null;
	containerRef: React.RefObject<HTMLDivElement>;
}> = ({contentDimensions, canvasSize, assetMetadata, containerRef}) => {
	const {scale, canvasDimensions} = useStudioCanvasDimensions({
		canvasSize,
		contentDimensions,
		assetMetadata,
	});

	const {
		shouldCreateGuideRef,
		shouldDeleteGuideRef,
		setGuidesList,
		selectedGuideId,
		setSelectedGuideId,
	} = useContext(EditorShowGuidesContext);

	const rulerMarkingGaps = useMemo(() => {
		const minimumGap = MINIMUM_RULER_MARKING_GAP_PX;
		const predefinedGap = PREDEFINED_RULER_SCALE_GAPS.find(
			(gap) => gap * scale > minimumGap,
		);

		return predefinedGap || MAXIMUM_PREDEFINED_RULER_SCALE_GAP;
	}, [scale]);

	const horizontalRulerScaleRange = useMemo(
		() =>
			getRulerScaleRange({
				canvasLength: canvasDimensions.width,
				containerRef,
				scale,
			}),
		[canvasDimensions.width, containerRef, scale],
	);

	const verticalRulerScaleRange = useMemo(
		() =>
			getRulerScaleRange({
				canvasLength: canvasDimensions.height,
				containerRef,
				scale,
			}),
		[canvasDimensions.height, containerRef, scale],
	);

	const {
		points: horizontalRulerPoints,
		startMarking: horizontalRulerStartMarking,
	} = useMemo(
		() =>
			getRulerPoints({
				rulerScaleRange: horizontalRulerScaleRange,
				rulerMarkingGaps,
				scale,
			}),
		[horizontalRulerScaleRange, rulerMarkingGaps, scale],
	);

	const {points: verticalRulerPoints, startMarking: verticalRulerStartMarking} =
		useMemo(
			() =>
				getRulerPoints({
					rulerScaleRange: verticalRulerScaleRange,
					rulerMarkingGaps,
					scale,
				}),
			[verticalRulerScaleRange, rulerMarkingGaps, scale],
		);

	const requestAnimationFrameRef = useRef<number | null>(null);

	const onMouseMove = useCallback(
		(e: PointerEvent) => {
			if (requestAnimationFrameRef.current) {
				cancelAnimationFrame(requestAnimationFrameRef.current);
			}

			requestAnimationFrameRef.current = requestAnimationFrame(() => {
				const {clientX: mouseX, clientY: mouseY} = e;
				const {
					left: containerLeft = 0,
					top: containerTop = 0,
					right: containerRight = 0,
					bottom: containerBottom = 0,
				} = containerRef.current?.getBoundingClientRect() || {};
				if (
					mouseX < containerLeft ||
					mouseX > containerRight ||
					mouseY < containerTop ||
					mouseY > containerBottom
				) {
					if (!shouldDeleteGuideRef.current) {
						shouldDeleteGuideRef.current = true;
					}

					if (document.body.style.cursor !== 'no-drop') {
						document.body.style.cursor = 'no-drop';
					}

					setGuidesList((prevState) => {
						return prevState.map((guide) => {
							if (guide.id !== selectedGuideId) {
								return guide;
							}

							return {
								...guide,
								show: false,
							};
						});
					});
				} else {
					if (shouldDeleteGuideRef.current) {
						shouldDeleteGuideRef.current = false;
					}

					setGuidesList((prevState) => {
						return prevState.map((guide) => {
							if (guide.id !== selectedGuideId) {
								return guide;
							}

							const position =
								guide.orientation === 'vertical'
									? (mouseX - containerLeft) / scale -
									  canvasDimensions.left / scale
									: (mouseY - containerTop) / scale -
									  canvasDimensions.top / scale;

							const desiredCursor =
								guide.orientation === 'vertical' ? 'ew-resize' : 'ns-resize';
							if (document.body.style.cursor !== desiredCursor) {
								document.body.style.cursor = desiredCursor;
							}

							return {
								...guide,
								position: Math.floor(position / 1.0),
								show: true,
							};
						});
					});
				}
			});
		},
		[
			containerRef,
			shouldDeleteGuideRef,
			selectedGuideId,
			scale,
			setGuidesList,
			canvasDimensions.left,
			canvasDimensions.top,
		],
	);

	const onMouseUp = useCallback(() => {
		if (shouldDeleteGuideRef.current) {
			setGuidesList((prevState) => {
				return prevState.filter((selected) => selected.id !== selectedGuideId);
			});
		}

		shouldDeleteGuideRef.current = false;
		document.body.style.cursor = 'auto';
		shouldCreateGuideRef.current = false;
		setSelectedGuideId(() => null);
		document.removeEventListener('pointerup', onMouseUp);
		document.removeEventListener('pointermove', onMouseMove);
	}, [
		selectedGuideId,
		shouldCreateGuideRef,
		shouldDeleteGuideRef,
		setSelectedGuideId,
		setGuidesList,
		onMouseMove,
	]);

	useEffect(() => {
		if (selectedGuideId !== null) {
			document.addEventListener('pointermove', onMouseMove);
			document.addEventListener('pointerup', onMouseUp);
		}

		return () => {
			document.removeEventListener('pointermove', onMouseMove);
			document.removeEventListener('pointerup', onMouseUp);
			if (requestAnimationFrameRef.current) {
				cancelAnimationFrame(requestAnimationFrameRef.current);
			}
		};
	}, [selectedGuideId, onMouseMove, onMouseUp]);

	return (
		<>
			<div style={originBlockStyles} />
			<Ruler
				orientation="horizontal"
				scale={scale}
				points={horizontalRulerPoints}
				startMarking={horizontalRulerStartMarking}
				containerRef={containerRef}
				markingGaps={rulerMarkingGaps}
				originOffset={canvasDimensions.left}
			/>
			<Ruler
				orientation="vertical"
				scale={scale}
				points={verticalRulerPoints}
				startMarking={verticalRulerStartMarking}
				containerRef={containerRef}
				markingGaps={rulerMarkingGaps}
				originOffset={canvasDimensions.top}
			/>
		</>
	);
};
