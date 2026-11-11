// 담당: M3 좌표 메타데이터
// 캔버스의 마우스 입력(노드 드래그, 간선 꺾임점 수정, 고정 해제)을 받아 Workspace로 넘긴다.
// 데이터를 직접 바꾸지 않는다. 화면 좌표는 줌 배율로 나눠 100% 기준 픽셀로 바꾼 뒤 넘긴다.
// screen/screenPoints는 줌이 적용된 캔버스 콘텐츠 원점 기준 CSS 픽셀이다.
// 호출부에서 브라우저 위치·스크롤·팬·여백을 보정한다. clientX/clientY를 그대로 넘기지 않는다.
// 노드는 포인터 위치가 아니라 잡은 지점을 보정한 노드 왼쪽 위 좌표를 넘긴다.
// 이미 100% 기준 좌표로 변환했다면 zoom=1로 넘겨 중복 변환을 피한다.
// zoom은 1=100%, 2=200%, 0.5=50%인 유한한 양수다. 잘못된 값은 RangeError다.
// 공개 void 시그니처를 유지하며, Workspace의 비동기 실패는 작업·ID·원본 오류를 콘솔에 보고한다.
import type { Workspace } from '../application/Workspace';
import type { Point } from '../domain/metadata/geometry';

export class DragController {
  constructor(private readonly workspace: Workspace) {}

  /** 노드 드래그가 끝났을 때. 옮긴 노드는 고정(pinned)된다. */
  onNodeDragEnd(nodeId: string, screen: Point, zoom: number): void {
    assertValidZoom(zoom);
    void this.workspace.moveNode(nodeId, screen.x / zoom, screen.y / zoom).catch((error: unknown) => {
      console.error('DragController.moveNode failed', nodeId, error);
    });
  }

  /** 간선 꺾임점을 손으로 고쳤을 때. 이 경로는 수동(isManual)으로 보존된다. */
  onEdgeWaypointsChanged(edgeId: string, screenPoints: Point[], zoom: number): void {
    assertValidZoom(zoom);
    const waypoints = screenPoints.map((point) => ({ x: point.x / zoom, y: point.y / zoom }));
    void this.workspace.updateEdgeRoute(edgeId, waypoints).catch((error: unknown) => {
      console.error('DragController.updateEdgeRoute failed', edgeId, error);
    });
  }

  /** 고정을 풀어 다시 자동 배치 대상으로 돌릴 때. */
  onUnpinRequested(nodeId: string): void {
    void this.workspace.unpinNode(nodeId).catch((error: unknown) => {
      console.error('DragController.unpinNode failed', nodeId, error);
    });
  }
}

function assertValidZoom(zoom: number): void {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    throw new RangeError('zoom must be a finite positive scale (1 = 100%)');
  }
}
