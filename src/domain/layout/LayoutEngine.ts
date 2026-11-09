// 담당: M2 레이아웃 엔진
// «Strategy» 다이어그램 종류마다 배치 방식을 갈아 끼운다.
import type { LayoutMetadata } from '../metadata/LayoutMetadata';
import type { AbstractDiagram } from '../model/diagram';
import type { LayoutResult } from './LayoutResult';

/**
 * 모든 구현이 지켜야 하는 약속:
 * 1. metadata에서 isPinned = true인 노드의 x, y는 결과에서도 그대로다.
 * 2. metadata에서 isManual = true인 간선 경로는 결과에서도 그대로다.
 * 3. 연결선이 없는 노드도 결과에 위치가 있어야 한다.
 * 4. 노드 30개 기준 1초 안에 끝난다(NFR-01).
 */
export interface LayoutEngine {
  applyLayout(diagram: AbstractDiagram, metadata: LayoutMetadata): Promise<LayoutResult>;
}
