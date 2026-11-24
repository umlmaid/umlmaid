// 담당: M3 좌표 메타데이터
// 화면 좌표·크기를 100% 기준 픽셀로 변환하여 Workspace로 전달한다.
import type { Workspace } from '../application/Workspace';
import type { Point } from '../domain/metadata/geometry';

export class DragController {
    constructor(private readonly workspace: Workspace) {}

    /** 노드 이동이 끝나면 위치를 저장하고 고정한다. */
    onNodeDragEnd(nodeId: string, screen: Point, zoom: number): void {
        assertValidZoom(zoom);

        void this.workspace
            .moveNode(
                nodeId,
                toCanvasUnit(screen.x, zoom),
                toCanvasUnit(screen.y, zoom),
            )
            .catch((error: unknown) => {
                console.error('DragController.moveNode failed', nodeId, error);
            });
    }

    /** 모서리 크기 조정 결과를 좌표·크기로 변환하여 전달한다. */
    onNodeResizeEnd(
        nodeId: string,
        screen: Point,
        screenSize: { width: number; height: number },
        zoom: number,
    ): void {
        assertValidZoom(zoom);

        void this.workspace
            .resizeNode(
                nodeId,
                toCanvasUnit(screen.x, zoom),
                toCanvasUnit(screen.y, zoom),
                toCanvasUnit(screenSize.width, zoom),
                toCanvasUnit(screenSize.height, zoom),
            )
            .catch((error: unknown) => {
                console.error('DragController.resizeNode failed', nodeId, error);
            });
    }

    /** 사용자가 수정한 간선 경로를 전달한다. */
    onEdgeWaypointsChanged(
        edgeId: string,
        screenPoints: Point[],
        zoom: number,
    ): void {
        assertValidZoom(zoom);

        const waypoints = screenPoints.map((point) => ({
            x: toCanvasUnit(point.x, zoom),
            y: toCanvasUnit(point.y, zoom),
        }));

        void this.workspace
            .updateEdgeRoute(edgeId, waypoints)
            .catch((error: unknown) => {
                console.error('DragController.updateEdgeRoute failed', edgeId, error);
            });
    }

    /** 노드 고정을 해제한다. */
    onUnpinRequested(nodeId: string): void {
        void this.workspace.unpinNode(nodeId).catch((error: unknown) => {
            console.error('DragController.unpinNode failed', nodeId, error);
        });
    }
}

/** 좌표를 기준 배율로 변환하고 0.1px 단위로 반올림한다. */
function toCanvasUnit(value: number, zoom: number): number {
    return Math.round((value / zoom) * 10) / 10 + 0;
}

function assertValidZoom(zoom: number): void {
    if (!Number.isFinite(zoom) || zoom <= 0) {
        throw new RangeError('zoom must be a finite positive scale (1 = 100%)');
    }
}