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
  /** true면 자동 배치가 이 노드의 x, y를 절대 바꾸지 않는다 */
  isPinned: boolean;
}

export interface EdgeRoute {
  /** 시작점·끝점을 제외한 꺾이는 지점들 */
  waypoints: Point[];
  /** true면 사용자가 손으로 고친 경로라 자동 배치가 바꾸지 않는다 */
  isManual: boolean;
}
