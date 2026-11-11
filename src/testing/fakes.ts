// 다른 모듈이 완성되기 전에 연결을 시험하는 가짜 부품.
// 예: M4는 진짜 엔진 대신 FakeLayoutEngine을 넣어 흐름부터 만든다.
import type { MetadataFactory } from '../application/SyncManager';
import type { Snapshot } from '../application/Snapshot';
import { VersionHistory } from '../application/VersionHistory';
import type { LayoutEngine } from '../domain/layout/LayoutEngine';
import { LayoutEngineFactory } from '../domain/layout/LayoutEngineFactory';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { EdgeRoute, NodePosition } from '../domain/metadata/geometry';
import { LayoutMetadata } from '../domain/metadata/LayoutMetadata';
import { AbstractDiagram } from '../domain/model/diagram';
import { RelationEdge } from '../domain/model/edges';
import { ClassNode } from '../domain/model/nodes';
import { DiagramType, RelationType } from '../domain/model/types';
import { MermaidParser } from '../infrastructure/parser/MermaidParser';
import type { ParseError, ParseResult } from '../infrastructure/parser/ParseResult';

/** 노드를 가로로 한 줄에 늘어놓는다. 고정된 노드와 수동 간선 경로는 그대로 둔다. */
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
    const edgeRoutes = new Map<string, EdgeRoute>();
    for (const edge of diagram.edges) {
      const manual = metadata.getEdgeRoute(edge.id);
      edgeRoutes.set(edge.id, manual?.isManual ? manual : { waypoints: [], isManual: false });
    }
    return { nodePositions, edgeRoutes };
  }
}

/** 다이어그램 종류와 상관없이 같은 엔진을 돌려준다 */
export class FakeLayoutEngineFactory extends LayoutEngineFactory {
  constructor(readonly engine: LayoutEngine = new FakeLayoutEngine()) {
    super();
  }

  override getEngine(): LayoutEngine {
    return this.engine;
  }
}

/**
 * 진짜 Mermaid 대신 아주 작은 문법만 읽는 파서.
 *   class A      → 노드 A
 *   A --> B      → 간선 (id "A-->B")
 *   !!           → 그 줄에서 문법 오류
 */
export class FakeParser extends MermaidParser {
  override parse(text: string): ParseResult {
    const nodes: ClassNode[] = [];
    const edges: RelationEdge[] = [];
    const errors: ParseError[] = [];
    text.split('\n').forEach((raw, i) => {
      const line = raw.trim();
      let m: RegExpMatchArray | null;
      if (!line) return;
      if (line.includes('!!')) errors.push({ line: i + 1, column: 1, message: '가짜 문법 오류' });
      else if ((m = line.match(/^class (\w+)$/))) nodes.push(new ClassNode(m[1], m[1]));
      else if ((m = line.match(/^(\w+) --> (\w+)$/)))
        edges.push(new RelationEdge(`${m[1]}-->${m[2]}`, m[1], m[2], RelationType.ASSOCIATION));
    });
    if (errors.length) return { errors };
    return { diagram: new AbstractDiagram(DiagramType.CLASS, nodes, edges), errors };
  }
}

/** M3의 LayoutMetadata가 완성되기 전까지 쓰는 메모리 구현 */
export class InMemoryLayoutMetadata extends LayoutMetadata {
  private readonly pos = new Map<string, NodePosition>();
  private readonly routes = new Map<string, EdgeRoute>();

  override getPosition(nodeId: string): NodePosition | undefined {
    return this.pos.get(nodeId);
  }

  override setPosition(nodeId: string, p: NodePosition): void {
    this.pos.set(nodeId, { ...p });
  }

  override setPinned(nodeId: string, pinned: boolean): void {
    const p = this.pos.get(nodeId);
    if (p) this.pos.set(nodeId, { ...p, isPinned: pinned });
  }

  override getEdgeRoute(edgeId: string): EdgeRoute | undefined {
    return this.routes.get(edgeId);
  }

  override setEdgeRoute(edgeId: string, route: EdgeRoute): void {
    this.routes.set(edgeId, { waypoints: [...route.waypoints], isManual: route.isManual });
  }

  override toJson(): string {
    return JSON.stringify({ positions: Object.fromEntries(this.pos), edgeRoutes: Object.fromEntries(this.routes) });
  }

  static parse(json: string): InMemoryLayoutMetadata {
    const meta = new InMemoryLayoutMetadata();
    if (!json) return meta;
    const data = JSON.parse(json) as { positions: Record<string, NodePosition>; edgeRoutes: Record<string, EdgeRoute> };
    for (const [id, p] of Object.entries(data.positions)) meta.setPosition(id, p);
    for (const [id, r] of Object.entries(data.edgeRoutes)) meta.setEdgeRoute(id, r);
    return meta;
  }
}

export const inMemoryMetadataFactory: MetadataFactory = {
  create: () => new InMemoryLayoutMetadata(),
  fromJson: (json) => InMemoryLayoutMetadata.parse(json),
};

/** M6의 VersionHistory가 완성되기 전까지 쓰는 메모리 구현(VersionHistory.ts 주석의 동작 그대로) */
export class InMemoryVersionHistory extends VersionHistory {
  private readonly stack: Snapshot[] = [];
  private current = -1;

  override push(snapshot: Snapshot): void {
    this.stack.splice(this.current + 1);
    this.stack.push(snapshot);
    this.current = this.stack.length - 1;
  }

  override undo(): Snapshot | undefined {
    if (this.current <= 0) return undefined;
    return this.stack[--this.current];
  }

  override redo(): Snapshot | undefined {
    if (this.current >= this.stack.length - 1) return undefined;
    return this.stack[++this.current];
  }

  override canUndo(): boolean {
    return this.current > 0;
  }

  override canRedo(): boolean {
    return this.current < this.stack.length - 1;
  }

  override list(): Snapshot[] {
    return [...this.stack];
  }
}
