// 담당: M4 동기화·흐름
// «Mediator» 코드 변경과 마우스 변경을 받아 순서대로 처리한다.
//   코드 변경: parse → mergeMetadata → 엔진 선택 → applyLayout → notifyViews
//   마우스 변경: LayoutMetadata만 수정 → applyLayout → notifyViews (Mermaid 코드는 바꾸지 않는다)
//
// LayoutMetadata에는 사용자가 정한 것(고정 좌표, 수동 간선 경로)과, 자동으로 한 번 놓인 노드의 자리를 담는다.
// 자동으로 놓인 자리도 기억해야 새 노드가 생겨도 기존 노드가 움직이지 않고, 파일을 다시 열어도 같은 그림이 나온다.
// (인터뷰: "기존 객체의 배치가 바뀌면 안됨", "로드시 UI가 유지되도록")
import { LayoutEngineFactory } from '../domain/layout/LayoutEngineFactory';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { Point } from '../domain/metadata/geometry';
import { LayoutMetadata } from '../domain/metadata/LayoutMetadata';
import { AbstractDiagram } from '../domain/model/diagram';
import { DiagramType } from '../domain/model/types';
import { MermaidParser } from '../infrastructure/parser/MermaidParser';
import { isSuccess } from '../infrastructure/parser/ParseResult';
import { toSourceLines } from '../infrastructure/parser/lines';
import { changeNodeLabel } from '../infrastructure/parser/NodeLabelEditor';
import { measureNode } from '../domain/layout/nodeSize';
import type { DiagramView } from './DiagramView';
import type { Snapshot } from './Snapshot';

/** LayoutMetadata를 만드는 방법. 테스트에서 가짜로 바꿔 끼울 수 있게 따로 뺐다. */
export interface MetadataFactory {
  create(): LayoutMetadata;
  /** json이 빈 문자열이면 빈 메타데이터 */
  fromJson(json: string): LayoutMetadata;
}

const defaultMetadataFactory: MetadataFactory = {
  create: () => new LayoutMetadata(),
  fromJson: (json) => (json ? LayoutMetadata.fromJson(json) : new LayoutMetadata()),
};

export class SyncManager {
  private currentText = '';
  /** 마지막으로 파싱에 성공한 다이어그램. 문법 오류 중에는 이전 것을 그대로 둔다(FR-03-5). */
  private currentDiagram?: AbstractDiagram;
  private currentMetadata: LayoutMetadata;
  private lastLayout?: LayoutResult;
  private views: DiagramView[] = [];
  /** 배치는 비동기라 늦게 끝난 옛 결과가 새 결과를 덮지 않도록 순번을 매긴다 */
  private revision = 0;

  constructor(
    private readonly parser = new MermaidParser(),
    private readonly layoutEngineFactory = new LayoutEngineFactory(),
    private readonly metadataFactory: MetadataFactory = defaultMetadataFactory,
  ) {
    this.currentMetadata = metadataFactory.create();
  }

  get text(): string {
    return this.currentText;
  }

  get metadata(): LayoutMetadata {
    return this.currentMetadata;
  }

  addView(view: DiagramView): void {
    this.views.push(view);
  }

  removeView(view: DiagramView): void {
    this.views = this.views.filter((v) => v !== view);
  }

  /** 반영됐으면 true. 문법 오류이거나 더 새 변경에 밀려 버려졌으면 false. */
  async onTextChanged(text: string): Promise<boolean> {
    this.currentText = text;
    if (toSourceLines(text).length === 0) return this.clear();
    const result = this.parser.parse(text);
    if (!isSuccess(result)) {
      this.revision++; // 진행 중인 옛 배치 결과가 오류 표시를 덮지 않게 한다
      for (const view of this.views) view.onParseError(result.errors);
      return false;
    }
    const diagram = result.diagram!;
    this.currentDiagram = diagram;
    this.currentMetadata = this.mergeMetadata(this.currentMetadata, diagram);
    return this.relayout();
  }

  /** 드래그가 끝났을 때. 옮긴 노드는 고정된다(FR-04-2). */
  async onCanvasNodeMoved(nodeId: string, x: number, y: number): Promise<boolean> {
    const size = this.lastLayout?.nodePositions.get(nodeId);
    if (!this.currentDiagram?.getNode(nodeId) || !size) return false;
    this.currentMetadata.setPosition(nodeId, { x, y, width: size.width, height: size.height, isPinned: true });
    return this.relayout();
  }

  /** 크기 조정은 코드 대신 좌표·크기만 기록하고 노드를 고정한다. */
  async onCanvasNodeResized(nodeId: string, x: number, y: number, width: number, height: number): Promise<boolean> {
    const node = this.currentDiagram?.getNode(nodeId);
    if (!node || !this.lastLayout?.nodePositions.has(nodeId)) return false;
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0) throw new RangeError('노드 위치와 크기가 올바르지 않습니다.');
    const minimum = measureNode(node);
    this.currentMetadata.setPosition(nodeId, { x, y, width: Math.max(minimum.width, width), height: Math.max(minimum.height, height), isPinned: true });
    return this.relayout();
  }

  /** FR-02-4 예외: 명시적으로 확정한 표시 이름만 표준 별칭으로 코드에 반영한다. */
  async renameNode(nodeId: string, label: string): Promise<boolean> {
    const next = changeNodeLabel(this.currentText, nodeId, label);
    if (next === this.currentText) return false;
    const applied = await this.onTextChanged(next);
    if (applied) for (const view of this.views) view.onTextRestored(next);
    return applied;
  }

  /**
   * 간선 꺾임점을 손으로 고쳤을 때. 이후 재배치에서도 유지된다(FR-04-7).
   * 꺾임점은 캔버스 좌표라 양 끝 노드가 재배치로 움직이면 선 모양이 일그러진다.
   * 그래서 양 끝 노드도 지금 자리에 고정한다. 손댄 것은 자동 배치가 건드리지 않는다(인터뷰 Q3, Q8).
   */
  async onCanvasEdgeRouteChanged(edgeId: string, waypoints: Point[]): Promise<boolean> {
    const edge = this.currentDiagram?.edges.find((e) => e.id === edgeId);
    if (!edge) return false;
    this.currentMetadata.setEdgeRoute(edgeId, { waypoints, isManual: true });
    for (const nodeId of [edge.sourceId, edge.targetId]) {
      const pos = this.lastLayout?.nodePositions.get(nodeId);
      if (pos && !this.currentMetadata.getPosition(nodeId)?.isPinned) {
        this.currentMetadata.setPosition(nodeId, { ...pos, isPinned: true });
      }
    }
    return this.relayout();
  }

  /** 고정을 풀어 자동 배치로 돌린다(FR-04-4). 기억한 자리를 지워야 자동 배치가 새로 놓는다. */
  async unpinNode(nodeId: string): Promise<boolean> {
    if (!this.currentMetadata.getPosition(nodeId)?.isPinned) return false;
    this.currentMetadata.removePosition(nodeId);
    return this.relayout();
  }

  /** 모든 노드의 자리를 잊고 처음부터 자동 배치한다(FR-04-4). 다시 놓을 노드가 없으면 false. */
  async unpinAll(): Promise<boolean> {
    const placed = (this.currentDiagram?.nodes ?? []).filter((n) => this.currentMetadata.getPosition(n.id));
    if (placed.length === 0) return false;
    for (const node of placed) this.currentMetadata.removePosition(node.id);
    return this.relayout();
  }

  /** 실행취소·버전 복원 시 Snapshot을 적용한다(설계서 D-02) */
  restoreState(snapshot: Snapshot): Promise<boolean> {
    return this.load(snapshot.textState, snapshot.metadataState);
  }

  /** 코드와 좌표를 통째로 바꾼다. 파일 열기와 복원에 쓴다. */
  load(text: string, metadataJson: string): Promise<boolean> {
    this.currentMetadata = this.metadataFactory.fromJson(metadataJson);
    for (const view of this.views) view.onTextRestored(text);
    return this.onTextChanged(text);
  }

  /** 다시 파싱한 다이어그램에 기존 좌표·고정 정보를 옮겨 담고, 사라진 노드의 정보는 지운다 */
  private mergeMetadata(oldMeta: LayoutMetadata, newDiagram: AbstractDiagram): LayoutMetadata {
    const merged = this.metadataFactory.create();
    for (const node of newDiagram.nodes) {
      const pos = oldMeta.getPosition(node.id);
      if (pos) merged.setPosition(node.id, pos);
    }
    for (const edge of newDiagram.edges) {
      const route = oldMeta.getEdgeRoute(edge.id);
      if (route) merged.setEdgeRoute(edge.id, route);
    }
    return merged;
  }

  /** 코드가 비었으면(주석만 있어도) 오류가 아니라 빈 그림이다. 실행취소로 빈 문서에 돌아갔을 때 옛 그림이 남지 않게 한다. */
  private clear(): boolean {
    this.revision++;
    const diagram = new AbstractDiagram(DiagramType.CLASS);
    this.currentDiagram = diagram;
    this.currentMetadata = this.metadataFactory.create();
    this.lastLayout = { nodePositions: new Map(), edgeRoutes: new Map() };
    this.notifyViews(diagram, this.lastLayout);
    return true;
  }

  private async relayout(): Promise<boolean> {
    const diagram = this.currentDiagram;
    if (!diagram) return false;
    const rev = ++this.revision;
    const engine = this.layoutEngineFactory.getEngine(diagram.type);
    const layout = await engine.applyLayout(diagram, this.currentMetadata);
    if (rev !== this.revision) return false;
    // 처음 놓인 노드의 자리를 기억해 둔다. 다음 배치부터는 이 자리를 그대로 쓴다.
    for (const [id, pos] of layout.nodePositions) {
      if (!this.currentMetadata.getPosition(id)) this.currentMetadata.setPosition(id, { ...pos, isPinned: false });
    }
    this.lastLayout = layout;
    this.notifyViews(diagram, layout);
    return true;
  }

  private notifyViews(diagram: AbstractDiagram, layout: LayoutResult): void {
    for (const view of this.views) view.onDiagramUpdated(diagram, layout);
  }
}
