// 담당: M3 좌표 메타데이터
// 캔버스의 마우스 입력(노드 드래그, 간선 꺾임점 수정, 고정 해제)을 받아 Workspace로 넘긴다.
// 데이터를 직접 바꾸지 않는다. 화면 좌표는 줌 배율로 나눠 100% 기준 픽셀로 바꾼 뒤 넘긴다.
import type { Workspace } from '../application/Workspace';
import type { Point } from '../domain/metadata/geometry';
import { todo } from '../todo';

export class DragController {
  constructor(private readonly workspace: Workspace) {}

  /** 노드 드래그가 끝났을 때. 옮긴 노드는 고정(pinned)된다. */
  onNodeDragEnd(nodeId: string, screen: Point, zoom: number): void {
    todo('M3');
  }

  /** 간선 꺾임점을 손으로 고쳤을 때. 이 경로는 수동(isManual)으로 보존된다. */
  onEdgeWaypointsChanged(edgeId: string, screenPoints: Point[], zoom: number): void {
    todo('M3');
  }

  /** 고정을 풀어 다시 자동 배치 대상으로 돌릴 때. */
  onUnpinRequested(nodeId: string): void {
    todo('M3');
  }
}
