// 담당: M4 동기화·흐름
// «Mediator» 코드 변경과 마우스 변경을 받아 순서대로 처리한다.
//   코드 변경: parse → mergeMetadata → 엔진 선택 → applyLayout → notifyViews
//   마우스 변경: LayoutMetadata만 수정 → applyLayout → notifyViews (Mermaid 코드는 바꾸지 않는다)
//
// LayoutMetadata에는 사용자가 정한 것(고정 좌표, 수동 간선 경로)만 담는다.
// 자동 배치로 나온 좌표는 lastLayout에만 두고 저장하지 않는다. 다시 배치하면 다시 나오기 때문이다.
import { LayoutEngineFactory } from '../domain/layout/LayoutEngineFactory';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { Point } from '../domain/metadata/geometry';
import { LayoutMetadata } from '../domain/metadata/LayoutMetadata';
import type { AbstractDiagram } from '../domain/model/diagram';
import { MermaidParser } from '../infrastructure/parser/MermaidParser';
import { isSuccess } from '../infrastructure/parser/ParseResult';
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

  /** 간선 꺾임점을 손으로 고쳤을 때. 이후 재배치에서도 유지된다(FR-04-7). */
  async onCanvasEdgeRouteChanged(edgeId: string, waypoints: Point[]): Promise<boolean> {
    if (!this.currentDiagram?.edges.some((e) => e.id === edgeId)) return false;
    this.currentMetadata.setEdgeRoute(edgeId, { waypoints, isManual: true });
    return this.relayout();
  }

  /** 고정을 풀어 자동 배치로 돌린다(FR-04-4). */
  async unpinNode(nodeId: string): Promise<boolean> {
    if (!this.currentMetadata.getPosition(nodeId)) return false;
    this.currentMetadata.setPinned(nodeId, false);
    return this.relayout();
  }

  /** 모든 노드의 고정을 풀어 자동 배치로 돌린다(FR-04-4). 고정된 노드가 없으면 false. */
  async unpinAll(): Promise<boolean> {
    const pinned = (this.currentDiagram?.nodes ?? []).filter((n) => this.currentMetadata.getPosition(n.id)?.isPinned);
    if (pinned.length === 0) return false;
    for (const node of pinned) this.currentMetadata.setPinned(node.id, false);
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

  private async relayout(): Promise<boolean> {
    const diagram = this.currentDiagram;
    if (!diagram) return false;
    const rev = ++this.revision;
    const engine = this.layoutEngineFactory.getEngine(diagram.type);
    const layout = await engine.applyLayout(diagram, this.currentMetadata);
    if (rev !== this.revision) return false;
    this.lastLayout = layout;
    this.notifyViews(diagram, layout);
    return true;
  }

  private notifyViews(diagram: AbstractDiagram, layout: LayoutResult): void {
    for (const view of this.views) view.onDiagramUpdated(diagram, layout);
  }
}
