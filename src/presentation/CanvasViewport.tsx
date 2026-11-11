// 담당: M5 화면 — 확대/축소와 드래그 미리보기. 영구 좌표 변경은 M3에 전달한다.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { Point } from '../domain/metadata/geometry';
import type { AbstractDiagram } from '../domain/model/diagram';
import { DiagramType } from '../domain/model/types';
import type { DragController } from './DragController';
import { CanvasRenderer } from './CanvasRenderer';

interface Props {
    diagram?: AbstractDiagram;
    layout?: LayoutResult;
    controller: Pick<DragController, 'onNodeDragEnd' | 'onUnpinRequested'>;
}

interface ActiveDrag {
    pointerId: number;
    nodeId: string;
    startClient: Point;
    offset: Point;
    content: SVGGraphicsElement;
    capture: HTMLDivElement;
    moved: boolean;
}

interface Preview { nodeId: string; x: number; y: number }
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

export function CanvasViewport({ diagram, layout, controller }: Props) {
    const [zoom, setZoom] = useState(1);
    const [preview, setPreview] = useState<Preview>();
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
    };

    // 문서가 바뀌면 이전 문서의 드래그를 적용하지 않는다.
    useEffect(() => { cancelDrag(); }, [diagram, layout]);
    useEffect(() => () => {
        const drag = dragRef.current;
        dragRef.current = undefined;
        if (drag) releaseCapture(drag);
    }, []);

    const displayLayout = useMemo(() => {
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
    }, [diagram, layout, preview]);

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
        const node = target.closest<SVGGraphicsElement>('[data-node-id]');
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
            pointerId: event.pointerId, nodeId,
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
        setPreview({ nodeId: drag.nodeId, ...position });
    };

    const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const position = dragPosition(event, drag);
        dragRef.current = undefined;
        releaseCapture(drag);
        setPreview(undefined);
        if (!drag.moved || !position) return;
        try {
            // M3는 screen / zoom으로 변환한다. 여기서는 캔버스 원점 기준의 배율 적용 좌표를 전달한다.
            controller.onNodeDragEnd(drag.nodeId, { x: position.x * zoom, y: position.y * zoom }, zoom);
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
        .canvas-viewport [data-dragging="true"] [data-node-id] { cursor: grabbing; }
        .canvas-viewport .canvas-input:focus-visible { outline: 2px solid #2864b4; outline-offset: -2px; }
      `}</style>
            <div role="group" aria-label="확대·축소" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 8, borderBottom: '1px solid #d8dde3', fontSize: 14 }}>
                <button type="button" aria-label="축소" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(zoom - ZOOM_STEP)}>−</button>
                <output aria-label="현재 배율" style={{ minWidth: 48, textAlign: 'center' }}>{Math.round(zoom * 100)}%</output>
                <button type="button" aria-label="확대" disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(zoom + ZOOM_STEP)}>+</button>
                <button type="button" onClick={() => changeZoom(1)}>100%로 복원</button>
            </div>
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
                            data-dragging={preview ? 'true' : undefined}
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={cancelDrag}
                            onLostPointerCapture={() => { if (dragRef.current) cancelDrag(); }}
                            onKeyDown={(event) => { if (event.key === 'Escape') cancelDrag(); }}
                            style={{ position: 'absolute', left: 0, top: 0, width: size.width, height: size.height, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                        >
                            <CanvasRenderer diagram={diagram} layout={displayLayout} />
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
