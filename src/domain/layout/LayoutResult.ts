// 담당: M2 레이아웃 엔진
import type { EdgeRoute, NodePosition } from '../metadata/geometry';

export interface LayoutResult {
  /** 모든 노드(고립 노드 포함)의 최종 위치 */
  nodePositions: Map<string, NodePosition>;
  edgeRoutes: Map<string, EdgeRoute>;
}
