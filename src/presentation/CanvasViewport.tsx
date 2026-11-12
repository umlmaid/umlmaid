// 담당: M5 화면 — 확대/축소와 드래그 미리보기. 영구 좌표 변경은 M3에 전달한다.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { Point } from '../domain/metadata/geometry';
import type { AbstractDiagram } from '../domain/model/diagram';
import { DiagramType } from '../domain/model/types';
import type { DragController } from './DragController';
import { CanvasRenderer, classRoute } from './CanvasRenderer';

interface Props {
    diagram?: AbstractDiagram;
    layout?: LayoutResult;
    controller: Pick<DragController, 'onNodeDragEnd' | 'onUnpinRequested' | 'onEdgeWaypointsChanged'>;
}

interface DragBase {
    pointerId: number;
    startClient: Point;
    offset: Point;
    content: SVGGraphicsElement;
    capture: HTMLDivElement;
    moved: boolean;
}

type ActiveDrag = DragBase & (
    { kind: 'node'; nodeId: string } |
    { kind: 'edge'; edgeId: string; index: number; waypoints: Point[] }
    );
interface Preview { nodeId: string; x: number; y: number }
interface EdgePreview { edgeId: string; waypoints: Point[] }
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.25;

function pointerPosition(client: Point, content: SVGGraphicsElement): Point | undefined {
    const matrix = content.getScreenCTM();
    if (!matrix) return undefined;
    // SVG 행렬에 배율·스크롤·캔버스 여백이 모두 포함돼 있다.
    const point = new DOMPoint(client.x, client.y).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
}

function failureMessage(error: unknown): string {
    if (error instanceof Error && error.message.includes('TODO(M3)')) {
        return '아직 이동·고정 저장 기능이 준비되지 않았습니다. 원래 상태로 돌아갑니다.';
    }
    return error instanceof Error ? error.message : '작업을 완료하지 못했습니다.';
}

function closestSegment(point: Point, points: Point[]): number {
    let best = 0;
    let distance = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        const next = Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
        if (next < distance) { distance = next; best = i; }
    }
    return best;
}

function editableRoute(diagram: AbstractDiagram, layout: LayoutResult, edgeId: string) {
    const edge = diagram.edges.find((item) => item.id === edgeId);
    if (!edge) return undefined;
    const source = layout.nodePositions.get(edge.sourceId);
    const target = layout.nodePositions.get(edge.targetId);
    if (!source || !target) return undefined;
    const sequence = diagram.type === DiagramType.SEQUENCE;
    let waypoints = layout.edgeRoutes.get(edge.id)?.waypoints ?? [];
    const rendered = sequence ? waypoints : classRoute(source, target, waypoints, edge.sourceId === edge.targetId);
    if (!sequence && edge.sourceId === edge.targetId && waypoints.length === 0) waypoints = rendered.slice(1, -1);
    const full = sequence ? waypoints : [
        { x: source.x + source.width / 2, y: source.y + source.height / 2 },
        ...waypoints,
        { x: target.x + target.width / 2, y: target.y + target.height / 2 },
    ];
    return { waypoints, rendered, full, sequence };
}

/** 넓은 클릭 영역을 눌러도 실제 선 위에서 잡도록 가장 가까운 위치를 구한다. */
function projectOnRoute(point: Point, points: Point[]): Point {
    const index = closestSegment(point, points);
    const a = points[index], b = points[index + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return { x: a.x + t * dx, y: a.y + t * dy };
}

export function CanvasViewport({ diagram, layout, controller }: Props) {
    const [zoom, setZoom] = useState(1);
    const [preview, setPreview] = useState<Preview>();
    const [edgePreview, setEdgePreview] = useState<EdgePreview>();
    const [selectedEdge, setSelectedEdge] = useState<string>();
    const [insertionPoint, setInsertionPoint] = useState<Point>();
    const [message, setMessage] = useState('');
    const [size, setSize] = useState({ width: 640, height: 400, offsetX: 0, offsetY: 0 });
    const hostRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<ActiveDrag | undefined>(undefined);

    const releaseCapture = (drag: ActiveDrag) => {
        if (drag.capture.hasPointerCapture(drag.pointerId)) drag.capture.releasePointerCapture(drag.pointerId);
    };
    const cancelDrag = () => {
        const drag = dragRef.current;
        dragRef.current = undefined;
        if (drag) releaseCapture(drag);
        setPreview(undefined);
        setEdgePreview(undefined);
    };

    // 문서가 바뀌면 이전 문서의 드래그를 적용하지 않는다.
    useEffect(() => { cancelDrag(); setInsertionPoint(undefined); }, [diagram, layout]);
    useEffect(() => {
        setSelectedEdge((id) => diagram?.edges.some((edge) => edge.id === id) ? id : undefined);
    }, [diagram]);
    useEffect(() => () => {
        const drag = dragRef.current;
        dragRef.current = undefined;
        if (drag) releaseCapture(drag);
    }, []);

    const displayLayout = useMemo(() => {
        if (layout && edgePreview) {
            const edgeRoutes = new Map(layout.edgeRoutes);
            edgeRoutes.set(edgePreview.edgeId, { waypoints: edgePreview.waypoints, isManual: true });
            return { ...layout, edgeRoutes };
        }
        if (!layout || !preview) return layout;
        const original = layout.nodePositions.get(preview.nodeId);
        if (!original) return layout;
        // 화면용 복사본만 움직인다. M3의 LayoutMetadata나 전달받은 Map은 수정하지 않는다.
        const nodePositions = new Map(layout.nodePositions);
        nodePositions.set(preview.nodeId, { ...original, x: preview.x, y: preview.y });
        if (diagram?.type !== DiagramType.SEQUENCE) return { ...layout, nodePositions };
        const dx = preview.x - original.x;
        const edgeRoutes = new Map(layout.edgeRoutes);
        for (const edge of diagram.edges) {
            if (edge.sourceId !== preview.nodeId && edge.targetId !== preview.nodeId) continue;
            const route = layout.edgeRoutes.get(edge.id);
            if (!route) continue;
            const self = edge.sourceId === edge.targetId;
            edgeRoutes.set(edge.id, {
                ...route,
                waypoints: route.waypoints.map((point, index) => ({
                    ...point,
                    x: point.x + (self || (index === 0 && edge.sourceId === preview.nodeId) || (index === route.waypoints.length - 1 && edge.targetId === preview.nodeId) ? dx : 0),
                })),
            });
        }
        return { ...layout, nodePositions, edgeRoutes };
    }, [diagram, layout, preview, edgePreview]);

    const edgeControls = useMemo(() => {
        const edge = diagram?.edges.find((item) => item.id === selectedEdge);
        if (!edge || !displayLayout) return undefined;
        const route = editableRoute(diagram!, displayLayout, edge.id);
        if (!route) return undefined;
        const { waypoints, rendered, full, sequence } = route;
        const existing = waypoints.flatMap((point, index) => sequence && (index === 0 || index === waypoints.length - 1) ? [] : [{ point, index }]);
        const segment = insertionPoint ? closestSegment(insertionPoint, full) : 0;
        const additions = insertionPoint ? [{ point: insertionPoint, index: sequence ? segment + 1 : segment }] : [];
        return { edgeId: edge.id, waypoints, rendered, existing, additions };
    }, [diagram, displayLayout, selectedEdge, insertionPoint]);

    useLayoutEffect(() => {
        const svg = hostRef.current?.querySelector('svg');
        if (!svg || !diagram || !displayLayout) return;
        const width = Number(svg.getAttribute('width'));
        const height = Number(svg.getAttribute('height'));
        const content = svg.querySelector('g[transform]');
        const transform = content instanceof SVGGraphicsElement && content.transform.baseVal.numberOfItems > 0 ? content.transform.baseVal.getItem(0).matrix : undefined;
        const offsetX = transform?.e ?? 0;
        const offsetY = transform?.f ?? 0;
        if (width > 0 && height > 0) setSize((previous) => previous.width === width && previous.height === height && previous.offsetX === offsetX && previous.offsetY === offsetY ? previous : { width, height, offsetX, offsetY });
    }, [diagram, displayLayout]);

    const changeZoom = (next: number) => {
        cancelDrag();
        setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
    };

    const dragPosition = (event: ReactPointerEvent<HTMLDivElement>, drag: ActiveDrag): Point | undefined => {
        const point = pointerPosition({ x: event.clientX, y: event.clientY }, drag.content);
        return point ? { x: Math.max(0, point.x - drag.offset.x), y: Math.max(0, point.y - drag.offset.y) } : undefined;
    };

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || !event.isPrimary || dragRef.current || !layout) return;
        const target = event.target;
        if (!(target instanceof Element) || target.closest('button')) return;
        const handle = target.closest<SVGElement>('[data-waypoint-index]');
        if (handle && edgeControls) {
            const index = Number(handle.getAttribute('data-waypoint-index'));
            const content = handle.parentElement;
            if (!(content instanceof SVGGraphicsElement)) return;
            const point = pointerPosition({ x: event.clientX, y: event.clientY }, content);
            if (!point) return;
            const adding = handle.getAttribute('data-waypoint-add') === 'true';
            const origin = { x: Number(handle.getAttribute('cx')), y: Number(handle.getAttribute('cy')) };
            const waypoints = edgeControls.waypoints.map((p) => ({ ...p }));
            if (adding) waypoints.splice(index, 0, origin);
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            setMessage('');
            dragRef.current = {
                kind: 'edge', edgeId: edgeControls.edgeId, index, waypoints,
                pointerId: event.pointerId, startClient: { x: event.clientX, y: event.clientY },
                offset: { x: point.x - origin.x, y: point.y - origin.y },
                content, capture: event.currentTarget, moved: false,
            };
            return;
        }
        const node = target.closest<SVGGraphicsElement>('[data-node-id]');
        if (!node) {
            const edgeElement = target.closest<SVGGraphicsElement>('[data-edge-id]');
            const edgeId = edgeElement?.getAttribute('data-edge-id');
            setSelectedEdge(edgeId ?? undefined);
            setInsertionPoint(undefined);
            const content = edgeElement?.parentElement;
            if (!edgeId || !diagram || !(content instanceof SVGGraphicsElement)) return;
            const route = editableRoute(diagram, layout, edgeId);
            const point = pointerPosition({ x: event.clientX, y: event.clientY }, content);
            if (!route || route.rendered.length < 2 || !point) return;
            const origin = projectOnRoute(point, route.rendered);
            const segment = closestSegment(origin, route.full);
            const index = route.sequence ? segment + 1 : segment;
            const waypoints = route.waypoints.map((p) => ({ ...p }));
            waypoints.splice(index, 0, origin);
            setInsertionPoint(origin);
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            setMessage('');
            // 한 번 누른 자리에서 바로 끌 수 있다. 클릭만 하면 좌표는 저장하지 않는다.
            dragRef.current = {
                kind: 'edge', edgeId, index, waypoints,
                pointerId: event.pointerId, startClient: { x: event.clientX, y: event.clientY },
                offset: { x: point.x - origin.x, y: point.y - origin.y },
                content, capture: event.currentTarget, moved: false,
            };
            return;
        }
        setSelectedEdge(undefined);
        setInsertionPoint(undefined);
        const nodeId = node?.getAttribute('data-node-id');
        const position = nodeId ? layout.nodePositions.get(nodeId) : undefined;
        const content = node?.parentElement;
        if (!nodeId || !position || !(content instanceof SVGGraphicsElement)) return;
        const point = pointerPosition({ x: event.clientX, y: event.clientY }, content);
        if (!point) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        setMessage('');
        dragRef.current = {
            kind: 'node', pointerId: event.pointerId, nodeId,
            startClient: { x: event.clientX, y: event.clientY },
            offset: { x: point.x - position.x, y: point.y - position.y },
            content, capture: event.currentTarget, moved: false,
        };
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y) < 3 && !drag.moved) return;
        const position = dragPosition(event, drag);
        if (!position) return;
        drag.moved = true;
        if (drag.kind === 'node') setPreview({ nodeId: drag.nodeId, ...position });
        else setEdgePreview({ edgeId: drag.edgeId, waypoints: drag.waypoints.map((point, index) => index === drag.index ? position : point) });
    };

    const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const position = dragPosition(event, drag);
        dragRef.current = undefined;
        releaseCapture(drag);
        setPreview(undefined);
        setEdgePreview(undefined);
        if (!drag.moved || !position) return;
        try {
            // M3는 screen / zoom으로 변환한다. 여기서는 캔버스 원점 기준의 배율 적용 좌표를 전달한다.
            if (drag.kind === 'node') controller.onNodeDragEnd(drag.nodeId, { x: position.x * zoom, y: position.y * zoom }, zoom);
            else {
                const waypoints = drag.waypoints.map((point, index) => index === drag.index ? position : point);
                controller.onEdgeWaypointsChanged(drag.edgeId, waypoints.map((point) => ({ x: point.x * zoom, y: point.y * zoom })), zoom);
            }
        } catch (error) {
            setMessage(failureMessage(error));
        }
    };

    const unpin = (nodeId: string) => {
        cancelDrag();
        setMessage('');
        try { controller.onUnpinRequested(nodeId); }
        catch (error) { setMessage(failureMessage(error)); }
    };

    return (
        <section className="canvas-viewport" aria-label="다이어그램 캔버스" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: 'white', border: '1px solid #c5cbd3' }}>
            <style>{`
        .canvas-viewport [data-node-id] { cursor: grab; touch-action: none; }
        .canvas-viewport [data-edge-id] { cursor: pointer; touch-action: none; }
        .canvas-viewport [data-waypoint-index] { cursor: move; touch-action: none; }
        .canvas-viewport [data-dragging="true"] [data-node-id] { cursor: grabbing; }
        .canvas-viewport .canvas-input:focus-visible { outline: 2px solid #2864b4; outline-offset: -2px; }
      `}</style>
            <div role="group" aria-label="확대·축소" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 8, borderBottom: '1px solid #d8dde3', fontSize: 14 }}>
                <button type="button" aria-label="축소" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(zoom - ZOOM_STEP)}>−</button>
                <output aria-label="현재 배율" style={{ minWidth: 48, textAlign: 'center' }}>{Math.round(zoom * 100)}%</output>
                <button type="button" aria-label="확대" disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(zoom + ZOOM_STEP)}>+</button>
                <button type="button" onClick={() => changeZoom(1)}>100%로 복원</button>
            </div>
            <p style={{ margin: 0, padding: '5px 8px', fontSize: 12, color: '#59636f', borderBottom: '1px solid #d8dde3' }}>
                선의 원하는 위치를 잡아 끌면 꺾임점이 생깁니다. 기존 파란 점도 옮길 수 있습니다. Esc: 취소·선택 해제
            </p>
            {message && <div role="alert" style={{ padding: '8px 12px', color: '#a01724', background: '#fff1f2', fontSize: 13 }}>{message}</div>}
            <div data-canvas-scroll style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                {!diagram || !layout ? <p style={{ padding: 20, color: '#59636f' }}>Mermaid 코드를 입력하면 다이어그램이 표시됩니다.</p> :
                    <div style={{ position: 'relative', width: size.width * zoom, height: size.height * zoom }}>
                        <div
                            ref={hostRef}
                            className="canvas-input"
                            tabIndex={0}
                            role="group"
                            aria-label="노드 드래그 영역. Esc 키로 이동 취소"
                            data-dragging={preview || edgePreview ? 'true' : undefined}
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={cancelDrag}
                            onLostPointerCapture={() => { if (dragRef.current) cancelDrag(); }}
                            onKeyDown={(event) => { if (event.key === 'Escape') { cancelDrag(); setSelectedEdge(undefined); } }}
                            style={{ position: 'absolute', left: 0, top: 0, width: size.width, height: size.height, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                        >
                            <CanvasRenderer diagram={diagram} layout={displayLayout} />
                            {edgeControls && <svg data-export-exclude="true" aria-label="간선 경로 편집" width={size.width} height={size.height} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
                                <g transform={`translate(${size.offsetX},${size.offsetY})`}>
                                    <polyline points={edgeControls.rendered.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#2864b4" strokeWidth="3" opacity="0.4" />
                                    {!edgePreview && edgeControls.additions.map(({ point, index }, i) => <circle key={`add-${i}`} cx={point.x} cy={point.y} r="5" fill="white" stroke="#2864b4" strokeWidth="2" pointerEvents="all" data-waypoint-index={index} data-waypoint-add="true"><title>끌어서 꺾임점 추가</title></circle>)}
                                    {edgeControls.existing.map(({ point, index }) => <circle key={index} cx={point.x} cy={point.y} r="6" fill="#2864b4" stroke="white" strokeWidth="2" pointerEvents="all" data-waypoint-index={index}><title>끌어서 꺾임점 이동</title></circle>)}
                                </g>
                            </svg>}
                            {/* 화면 전용 HTML 표시이므로 내보낼 CanvasRenderer의 SVG에는 들어가지 않는다. */}
                            {diagram.nodes.map((node) => {
                                const position = displayLayout?.nodePositions.get(node.id);
                                if (!position?.isPinned) return null;
                                return <button key={node.id} type="button" data-export-exclude="true" aria-label={`${node.label} 고정 해제`} title={`${node.label}: 고정 해제`} onClick={() => unpin(node.id)} style={{ position: 'absolute', left: position.x + position.width + size.offsetX + 5, top: position.y + size.offsetY, border: '1px solid #9d7442', borderRadius: 3, padding: '2px 4px', background: '#fff3db', color: '#654214', fontSize: 12, cursor: 'pointer' }}>고정</button>;
                            })}
                        </div>
                    </div>
                }
            </div>
        </section>
    );
}
