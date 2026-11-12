// 담당: M5 화면 — 모델과 좌표를 변경하지 않고 SVG로 표시한다.
import { useId } from 'react';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { NodePosition, Point } from '../domain/metadata/geometry';
import type { AbstractDiagram } from '../domain/model/diagram';
import { MessageEdge, RelationEdge } from '../domain/model/edges';
import { ClassNode } from '../domain/model/nodes';
import { DiagramType, RelationType } from '../domain/model/types';

export const MIN_FONT_SIZE = 12;
const PADDING = 20;
const LABEL_ROOM = 80;
const LIFELINE_TAIL = 40;
// M2의 nodeSize.ts와 같은 값. 공통 타입이나 노드 크기는 이 파일에서 변경하지 않는다.
const LINE_HEIGHT = 20;
const SECTION_PADDING = 8;
const TEXT_PADDING = 12;

interface Props {
    diagram?: AbstractDiagram;
    layout?: LayoutResult;
}

const toPoints = (points: Point[]) => points.map((p) => `${p.x},${p.y}`).join(' ');
const sectionHeight = (lines: number) => lines * LINE_HEIGHT + SECTION_PADDING * 2;
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

function inside(p: Point, box: NodePosition): boolean {
    return p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
}

/** 노드 중심에서 나가는 경로를 사각형 테두리에서 시작하게 한다. */
function trimStart(points: Point[], box: NodePosition): Point[] {
    for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        if (inside(b, box)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const tx = dx === 0 ? Infinity : ((dx > 0 ? box.x + box.width : box.x) - a.x) / dx;
        const ty = dy === 0 ? Infinity : ((dy > 0 ? box.y + box.height : box.y) - a.y) / dy;
        const t = Math.min(tx, ty);
        return [{ x: a.x + dx * t, y: a.y + dy * t }, ...points.slice(i)];
    }
    return [];
}

function classRoute(source: NodePosition, target: NodePosition, bends: Point[], self: boolean): Point[] {
    const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const end = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    // 자동 경로가 없는 자기 관계도 상자 밖으로 돌아오게 표시한다.
    const route = self && bends.length === 0
        ? [
            { x: source.x + source.width + 36, y: start.y },
            { x: source.x + source.width + 36, y: source.y + source.height + 36 },
            { x: start.x, y: source.y + source.height + 36 },
        ]
        : bends;
    const points = [start, ...route, end].filter((p, i, all) => i === 0 || !samePoint(p, all[i - 1]));
    const fromBoundary = trimStart(points, source);
    return trimStart([...fromBoundary].reverse(), target).reverse();
}

/** 꺾은선의 실제 길이를 기준으로 라벨 위치를 잡는다. */
function halfway(points: Point[]): Point {
    const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
    let remaining = lengths.reduce((sum, n) => sum + n, 0) / 2;
    for (let i = 0; i < lengths.length; i += 1) {
        if (remaining <= lengths[i] && lengths[i] > 0) {
            const t = remaining / lengths[i];
            return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
        }
        remaining -= lengths[i];
    }
    return points[0];
}

function multiplicityPosition(end: Point, neighbour: Point): Point {
    const dx = neighbour.x - end.x;
    const dy = neighbour.y - end.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: end.x + dx / length * 24 - dy / length * 12, y: end.y + dy / length * 24 + dx / length * 12 };
}

function textWidth(text: string): number {
    return [...text].reduce((sum, ch) => sum + ((ch.codePointAt(0) ?? 0) > 0x7f ? 12 : 8), 0);
}

export function CanvasRenderer({ diagram, layout }: Props) {
    const markerPrefix = `uml-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    if (!diagram || !layout) return <svg width="100%" height="100%" aria-label="다이어그램 캔버스" />;

    const isSequence = diagram.type === DiagramType.SEQUENCE;
    const positions = [...layout.nodePositions.values()];
    const edges = diagram.edges.flatMap((edge) => {
        const source = layout.nodePositions.get(edge.sourceId);
        const target = layout.nodePositions.get(edge.targetId);
        if (!source || !target) return [];
        const bends = layout.edgeRoutes.get(edge.id)?.waypoints ?? [];
        // M2 약속: 시퀀스 waypoints는 전체 경로, 클래스 waypoints는 중간 굴절점이다.
        const points = isSequence
            ? bends.filter((p, i) => i === 0 || !samePoint(p, bends[i - 1]))
            : classRoute(source, target, bends, edge.sourceId === edge.targetId);
        if (points.length < 2) return [];
        const labelPoint = halfway(isSequence && edge.sourceId === edge.targetId ? points.slice(0, 2) : points);
        // 긴 메시지 이름도 글자를 줄이지 않고 캔버스 폭에 포함한다.
        const labelX = Math.max(textWidth(edge.label) / 2, labelPoint.x);
        return [{ edge, points, labelX, labelY: labelPoint.y - 6 }];
    });
    const routePoints = edges.flatMap(({ points }) => points);
    const bottom = Math.max(0, ...positions.map((p) => p.y + p.height), ...routePoints.map((p) => p.y));
    const lifelineEnd = bottom + LIFELINE_TAIL;
    const width = Math.max(
        0,
        ...positions.map((p) => p.x + p.width),
        ...routePoints.map((p) => p.x),
        ...edges.map(({ edge, labelX }) => labelX + textWidth(edge.label) / 2),
    ) + PADDING * 2 + LABEL_ROOM;
    const height = (isSequence ? lifelineEnd : bottom) + PADDING * 2;
    const marker = (name: string) => `url(#${markerPrefix}-${name})`;

    return (
        <svg width={width} height={height} style={{ background: 'white' }} fontSize={MIN_FONT_SIZE} fontFamily="sans-serif" aria-label={isSequence ? '시퀀스 다이어그램' : '클래스 다이어그램'}>
            <defs>
                <marker id={`${markerPrefix}-open`} viewBox="0 0 12 12" refX="12" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
                    <path d="M1,1 L11,6 L1,11" fill="none" stroke="black" />
                </marker>
                <marker id={`${markerPrefix}-triangle`} viewBox="0 0 12 12" refX="12" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
                    <path d="M1,1 L11,6 L1,11 Z" fill="white" stroke="black" />
                </marker>
                <marker id={`${markerPrefix}-filled`} viewBox="0 0 12 12" refX="12" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
                    <path d="M1,1 L11,6 L1,11 Z" fill="black" stroke="black" />
                </marker>
                <marker id={`${markerPrefix}-diamond`} viewBox="0 0 16 12" refX="16" refY="6" markerWidth="16" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
                    <path d="M1,6 L8,1 L15,6 L8,11 Z" fill="white" stroke="black" />
                </marker>
                <marker id={`${markerPrefix}-composition`} viewBox="0 0 16 12" refX="16" refY="6" markerWidth="16" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
                    <path d="M1,6 L8,1 L15,6 L8,11 Z" fill="black" stroke="black" />
                </marker>
            </defs>
            <g transform={`translate(${PADDING},${PADDING})`}>
                {isSequence && diagram.nodes.map((node) => {
                    const p = layout.nodePositions.get(node.id);
                    return p ? <line key={node.id} x1={p.x + p.width / 2} y1={p.y + p.height} x2={p.x + p.width / 2} y2={lifelineEnd} stroke="black" strokeDasharray="4 4" /> : null;
                })}
                {edges.map(({ edge, points, labelX, labelY }) => {
                    let markerName: string | undefined;
                    let dashed = false;
                    if (isSequence) {
                        const reply = edge instanceof MessageEdge && edge.isReply;
                        const asyncCall = edge instanceof MessageEdge && edge.isAsync;
                        dashed = reply;
                        // 현 MessageEdge에는 비동기 구분이 없으므로 일반 호출은 동기로 표시한다.
                        markerName = reply || asyncCall ? 'open' : 'filled';
                    } else if (edge instanceof RelationEdge) {
                        switch (edge.relationType) {
                            case RelationType.INHERITANCE: markerName = 'triangle'; break;
                            case RelationType.REALIZATION: markerName = 'triangle'; dashed = true; break;
                            case RelationType.DEPENDENCY: markerName = 'open'; dashed = true; break;
                            case RelationType.AGGREGATION: markerName = 'diamond'; break;
                            case RelationType.COMPOSITION: markerName = 'composition'; break;
                            case RelationType.ASSOCIATION: break; // 연관은 기본 실선. 탐색 가능성은 현재 모델에 없다.
                        }
                    }
                    const sourceLabel = multiplicityPosition(points[0], points[1]);
                    const targetLabel = multiplicityPosition(points[points.length - 1], points[points.length - 2]);
                    return (
                        <g key={edge.id} data-edge-id={edge.id}>
                            <polyline points={toPoints(points)} fill="none" stroke="black" strokeDasharray={dashed ? '6 4' : undefined} markerEnd={markerName ? marker(markerName) : undefined} />
                            {edge.label && <text x={labelX} y={labelY} textAnchor="middle" fill="black" stroke="white" strokeWidth="3" paintOrder="stroke">{edge.label}</text>}
                            {!isSequence && edge instanceof RelationEdge && <>
                                {edge.sourceMultiplicity && <text x={sourceLabel.x} y={sourceLabel.y} textAnchor="middle" fill="black" stroke="white" strokeWidth="3" paintOrder="stroke">{edge.sourceMultiplicity}</text>}
                                {edge.targetMultiplicity && <text x={targetLabel.x} y={targetLabel.y} textAnchor="middle" fill="black" stroke="white" strokeWidth="3" paintOrder="stroke">{edge.targetMultiplicity}</text>}
                            </>}
                        </g>
                    );
                })}
                {diagram.nodes.map((node) => {
                    const p = layout.nodePositions.get(node.id);
                    if (!p) return null;
                    const classNode = !isSequence && node instanceof ClassNode ? node : undefined;
                    const headerHeight = classNode ? sectionHeight(classNode.stereotype ? 2 : 1) : p.height;
                    const attributesBottom = headerHeight + (classNode ? sectionHeight(classNode.attributes.length) : 0);
                    return (
                        <g key={node.id} data-node-id={node.id} transform={`translate(${p.x},${p.y})`}>
                            <rect width={p.width} height={p.height} fill="white" stroke="black" />
                            {classNode && <>
                                <line x1="0" y1={headerHeight} x2={p.width} y2={headerHeight} stroke="black" />
                                <line x1="0" y1={attributesBottom} x2={p.width} y2={attributesBottom} stroke="black" />
                                {classNode.stereotype && <text x={p.width / 2} y={SECTION_PADDING + 14} textAnchor="middle">{`«${classNode.stereotype}»`}</text>}
                            </>}
                            <text x={p.width / 2} y={classNode ? SECTION_PADDING + 14 + (classNode.stereotype ? LINE_HEIGHT : 0) : p.height / 2 + 4} textAnchor="middle" fontWeight="bold">{node.label}</text>
                            {classNode?.attributes.map((member, i) => <text key={`attribute-${i}`} x={TEXT_PADDING} y={headerHeight + SECTION_PADDING + 14 + i * LINE_HEIGHT}>{member}</text>)}
                            {classNode?.methods.map((member, i) => <text key={`method-${i}`} x={TEXT_PADDING} y={attributesBottom + SECTION_PADDING + 14 + i * LINE_HEIGHT}>{member}</text>)}
                        </g>
                    );
                })}
            </g>
        </svg>
    );
}
