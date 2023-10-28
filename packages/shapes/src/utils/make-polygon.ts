import type {Instruction} from '@remotion/paths';
import {resetPath, serializeInstructions} from '@remotion/paths';
import {joinPoints} from './join-points';
import type {ShapeInfo} from './shape-info';

export type MakePolygonProps = {
	points: number;
	radius: number;
	edgeRoundness?: number | null;
	cornerRadius?: number;
};

export type PolygonProps = {
	centerX: number;
	centerY: number;
	points: number;
	radius: number;
	edgeRoundness: number | null;
	cornerRadius: number;
};

function polygon({
	points,
	radius,
	centerX,
	centerY,
	cornerRadius,
	edgeRoundness,
}: PolygonProps): Instruction[] {
	const degreeIncrement = (Math.PI * 2) / points;
	const d = new Array(points).fill(0).map((_, i) => {
		const angle = degreeIncrement * i - Math.PI / 2;
		const point = {
			x: centerX + radius * Math.cos(angle),
			y: centerY + radius * Math.sin(angle),
		};
		return [point.x, point.y];
	}) as [number, number][];

	return joinPoints([...d, d[0]], {
		edgeRoundness,
		cornerRadius,
		roundCornerStrategy: cornerRadius > 0 ? 'bezier' : 'arc',
	});
}

export const makePolygon = ({
	points,
	radius,
	cornerRadius = 0,
	edgeRoundness = null,
}: MakePolygonProps): ShapeInfo => {
	if (points < 3) {
		throw new Error(`"points" should be minimum 3, got ${points}`);
	}

	const width = 2 * radius;
	const height = 2 * radius;

	const centerX = width / 2;
	const centerY = height / 2;

	const polygonPathInstructions = polygon({
		points,
		radius,
		centerX,
		centerY,
		cornerRadius,
		edgeRoundness,
	});
	return {
		path: resetPath(serializeInstructions(polygonPathInstructions)),
		width,
		height,
		transformOrigin: `${centerX} ${centerY}`,
		instructions: polygonPathInstructions,
	};
};
