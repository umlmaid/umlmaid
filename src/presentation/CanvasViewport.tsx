// 담당: M5 화면 — 확대/축소와 드래그 미리보기. 영구 좌표 변경은 M3에 전달한다.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { Point, NodePosition } from '../domain/metadata/geometry';
import { measureNode } from '../domain/layout/nodeSize';
import type { AbstractDiagram } from '../domain/model/diagram';
import { DiagramType } from '../domain/model/types';
import type { DragController } from './DragController';
import { CanvasRenderer, classRoute } from './CanvasRenderer';

interface Props {
    diagram?: AbstractDiagram;
    layout?: LayoutResult;
    controller: Pick<DragController, 'onNodeDragEnd' | 'onUnpinRequested' | 'onEdgeWaypointsChanged' | 'onNodeResizeEnd'>;
    onRenameNode?: (nodeId: string, label: string) => Promise<void>;
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
    { kind: 'resize'; nodeId: string; origin: NodePosition; startCanvas: Point; corner: string; minimum: { width: number; height: number } } |
    { kind: 'edge'; edgeId: string; index: number; waypoints: Point[] }
    );
interface Preview { nodeId: string; x: number; y: number; width?: number; height?: number }
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

export function CanvasViewport({ diagram, layout, controller, onRenameNode }: Props) {
    const [zoom, setZoom] = useState(1);
    const [preview, setPreview] = useState<Preview>();
    const [edgePreview, setEdgePreview] = useState<EdgePreview>();
    const [selectedEdge, setSelectedEdge] = useState<string>();
    const [selectedNode, setSelectedNode] = useState<string>();
    const [editing, setEditing] = useState<{ nodeId: string; label: string }>();
    const [renaming, setRenaming] = useState(false);
    const [renameError, setRenameError] = useState('');
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
        setSelectedNode((id) => diagram?.nodes.some((node) => node.id === id) ? id : undefined);
        setEditing(undefined);
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
        nodePositions.set(preview.nodeId, { ...original, x: preview.x, y: preview.y, width: preview.width ?? original.width, height: preview.height ?? original.height });
        if (diagram?.type !== DiagramType.SEQUENCE) return { ...layout, nodePositions };
        const dx = preview.x + (preview.width ?? original.width) / 2 - original.x - original.width / 2;
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

    const resizePosition = (event: ReactPointerEvent<HTMLDivElement>, drag: Extract<ActiveDrag, { kind: 'resize' }>): NodePosition | undefined => {
        const point = pointerPosition({ x: event.clientX, y: event.clientY }, drag.content);
        if (!point) return undefined;
        const dx = point.x - drag.startCanvas.x, dy = point.y - drag.startCanvas.y;
        const p = drag.origin;
        const west = drag.corner.includes('w'), north = drag.corner.includes('n');
        const x = west ? Math.max(0, Math.min(p.x + dx, p.x + p.width - drag.minimum.width)) : p.x;
        const y = north ? Math.max(0, Math.min(p.y + dy, p.y + p.height - drag.minimum.height)) : p.y;
        return { ...p, x, y, width: west ? p.x + p.width - x : Math.max(drag.minimum.width, p.width + dx), height: north ? p.y + p.height - y : Math.max(drag.minimum.height, p.height + dy) };
    };

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || !event.isPrimary || dragRef.current || !layout || editing || renaming) return;
        const target = event.target;
        if (!(target instanceof Element) || target.closest('button')) return;
        const resize = target.closest<SVGElement>('[data-resize-node]');
        if (resize) {
            const nodeId = resize.getAttribute('data-resize-node');
            const origin = nodeId ? layout.nodePositions.get(nodeId) : undefined;
            const node = diagram?.nodes.find((item) => item.id === nodeId);
            const content = resize.parentElement;
            if (!nodeId || !origin || !node || !(content instanceof SVGGraphicsElement)) return;
            const point = pointerPosition({ x: event.clientX, y: event.clientY }, content);
            if (!point) return;
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            setMessage('');
            dragRef.current = { kind: 'resize', nodeId, origin, startCanvas: point, minimum: measureNode(node), corner: resize.getAttribute('data-resize-corner') ?? 'se', pointerId: event.pointerId, startClient: { x: event.clientX, y: event.clientY }, offset: { x: 0, y: 0 }, content, capture: event.currentTarget, moved: false };
            return;
        }
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
            setSelectedNode(undefined);
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
        setSelectedNode(nodeId ?? undefined);
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
        if (drag.kind === 'resize') {
            const position = resizePosition(event, drag);
            if (position) { drag.moved = true; setPreview({ nodeId: drag.nodeId, ...position }); }
            return;
        }
        const position = dragPosition(event, drag);
        if (!position) return;
        drag.moved = true;
        if (drag.kind === 'node') setPreview({ nodeId: drag.nodeId, ...position });
        else setEdgePreview({ edgeId: drag.edgeId, waypoints: drag.waypoints.map((point, index) => index === drag.index ? position : point) });
    };

    const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const position = drag.kind === 'resize' ? resizePosition(event, drag) : dragPosition(event, drag);
        dragRef.current = undefined;
        releaseCapture(drag);
        setPreview(undefined);
        setEdgePreview(undefined);
        if (!drag.moved || !position) return;
        try {
            // M3는 screen / zoom으로 변환한다. 여기서는 캔버스 원점 기준의 배율 적용 좌표를 전달한다.
            if (drag.kind === 'resize') {
                const dimensions = position as NodePosition;
                controller.onNodeResizeEnd(drag.nodeId, { x: dimensions.x * zoom, y: dimensions.y * zoom }, { width: dimensions.width * zoom, height: dimensions.height * zoom }, zoom);
            }
            else if (drag.kind === 'node') controller.onNodeDragEnd(drag.nodeId, { x: position.x * zoom, y: position.y * zoom }, zoom);
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

    const selectedPosition = selectedNode ? displayLayout?.nodePositions.get(selectedNode) : undefined;
    const startRename = (target: EventTarget | null) => {
        if (!onRenameNode || !(target instanceof Element) || target.closest('button') || renaming) return;
        // 포인터 캡처로 dblclick 대상이 캔버스가 되어도 직전에 누른 노드를 사용한다.
        const nodeId = target.closest('[data-node-id]')?.getAttribute('data-node-id') ?? selectedNode;
        const node = diagram?.nodes.find((item) => item.id === nodeId);
        if (!node) return;
        cancelDrag();
        setSelectedNode(node.id);
        setSelectedEdge(undefined);
        setRenameError('');
        setEditing({ nodeId: node.id, label: node.label });
    };

    const finishRename = async () => {
        if (!editing || !onRenameNode || renaming) return;
        setRenaming(true);
        setRenameError('');
        try { await onRenameNode(editing.nodeId, editing.label); setEditing(undefined); }
        catch (error) { setRenameError(error instanceof Error ? error.message : '이름을 변경하지 못했습니다.'); }
        finally { setRenaming(false); }
    };

    return (
        <section className="canvas-viewport" aria-label="다이어그램 캔버스" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: 'white', border: '1px solid #c5cbd3' }}>
            <style>{`
        .canvas-viewport [data-node-id] { cursor: grab; touch-action: none; }
        .canvas-viewport [data-edge-id] { cursor: pointer; touch-action: none; }
        .canvas-viewport [data-waypoint-index] { cursor: move; touch-action: none; }
        .canvas-viewport [data-resize-corner="nw"], .canvas-viewport [data-resize-corner="se"] { cursor: nwse-resize; touch-action: none; }
        .canvas-viewport [data-resize-corner="ne"], .canvas-viewport [data-resize-corner="sw"] { cursor: nesw-resize; touch-action: none; }
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
                노드 선택 후 모서리로 크기 조절 · 노드 더블클릭으로 이름 편집 · 선을 끌어 경로 수정 · Esc: 취소
            </p>
            {editing && <form aria-label="노드 이름 편집" onSubmit={(event) => { event.preventDefault(); void finishRename(); }} onKeyDown={(event) => { if (event.key === 'Escape' && !renaming) { event.preventDefault(); setEditing(undefined); } }} style={{ padding: 8, borderBottom: '1px solid #d8dde3' }}>
                <label>표시 이름 <input aria-label="표시 이름" autoFocus value={editing.label} disabled={renaming} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setEditing({ ...editing, label: event.target.value })} style={{ maxWidth: '100%', boxSizing: 'border-box', fontSize: 14 }} /></label>
                <button type="submit" disabled={renaming || !editing.label.trim()}>적용</button>
                <button type="button" disabled={renaming} onClick={() => setEditing(undefined)}>취소</button>
                <p style={{ margin: '4px 0', fontSize: 12 }}>관계에 쓰이는 ID는 유지하고 표시 이름을 Mermaid 별칭으로 반영합니다.</p>
                {renameError && <div role="alert" style={{ color: '#a01724' }}>{renameError}</div>}
            </form>}
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
                            onDoubleClick={(event) => startRename(event.target)}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={cancelDrag}
                            onLostPointerCapture={() => { if (dragRef.current) cancelDrag(); }}
                            onKeyDown={(event) => { if (event.key === 'Escape') { cancelDrag(); setSelectedEdge(undefined); setSelectedNode(undefined); } }}
                            style={{ position: 'absolute', left: 0, top: 0, width: size.width, height: size.height, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                        >
                            <CanvasRenderer diagram={diagram} layout={displayLayout} />
                            {selectedPosition && selectedNode && !editing && <svg data-export-exclude="true" aria-label="노드 크기 조절" width={size.width} height={size.height} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' }}>
                                <g transform={`translate(${size.offsetX},${size.offsetY})`}>
                                    {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
                                        const x = selectedPosition.x + (corner.includes('e') ? selectedPosition.width : 0);
                                        const y = selectedPosition.y + (corner.includes('s') ? selectedPosition.height : 0);
                                        return <rect key={corner} data-resize-node={selectedNode} data-resize-corner={corner} x={x - 5} y={y - 5} width="10" height="10" fill="white" stroke="#2864b4" strokeWidth="2" pointerEvents="all"><title>모서리를 끌어 크기 조절</title></rect>;
                                    })}
                                </g>
                            </svg>}
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
