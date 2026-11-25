// 담당: M3 좌표 메타데이터
// 좌표 단위는 캔버스 100% 배율 기준 픽셀이다. 모든 모듈이 같은 단위를 쓴다.

export interface Point {
  x: number;
  y: number;
}

export interface NodePosition {
  /** 노드 왼쪽 위 모서리 */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * true면 사용자가 손으로 정한 자리다(핀 표시, 크기 유지).
   * false여도 저장된 x, y는 자동 배치가 바꾸지 않는다. 한 번 놓인 노드는 새 노드가 생겨도 그대로다.
   */
  isPinned: boolean;
}

export interface EdgeRoute {
  /** 시작점·끝점을 제외한 꺾이는 지점들 */
  waypoints: Point[];
  /** true면 사용자가 손으로 고친 경로라 자동 배치가 바꾸지 않는다 */
  isManual: boolean;
}
