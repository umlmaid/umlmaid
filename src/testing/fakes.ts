// 다른 모듈이 완성되기 전에 연결을 시험하는 가짜 부품.
// 예: M4는 진짜 엔진 대신 FakeLayoutEngine을 넣어 흐름부터 만든다.
import type { LayoutEngine } from '../domain/layout/LayoutEngine';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { EdgeRoute, NodePosition } from '../domain/metadata/geometry';
import type { LayoutMetadata } from '../domain/metadata/LayoutMetadata';
import type { AbstractDiagram } from '../domain/model/diagram';

/** 노드를 가로로 한 줄에 늘어놓는다. 고정된 노드는 그 자리에 둔다. */
export class FakeLayoutEngine implements LayoutEngine {
  async applyLayout(diagram: AbstractDiagram, metadata: LayoutMetadata): Promise<LayoutResult> {
    const nodePositions = new Map<string, NodePosition>();
    diagram.nodes.forEach((node, i) => {
      const pinned = metadata.getPosition(node.id);
      nodePositions.set(
        node.id,
        pinned?.isPinned ? pinned : { x: i * 200, y: 0, width: 160, height: 80, isPinned: false },
      );
    });
    return { nodePositions, edgeRoutes: new Map<string, EdgeRoute>() };
  }
}
