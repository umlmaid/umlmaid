// 담당: M4 동기화·흐름
// «Mediator» 코드 변경과 마우스 변경을 받아 순서대로 처리한다.
//   코드 변경: parse → mergeMetadata → 엔진 선택 → applyLayout → notifyViews
//   마우스 변경: LayoutMetadata만 수정 → notifyViews (Mermaid 코드는 바꾸지 않는다)
import { LayoutEngineFactory } from '../domain/layout/LayoutEngineFactory';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { Point } from '../domain/metadata/geometry';
import { LayoutMetadata } from '../domain/metadata/LayoutMetadata';
import type { AbstractDiagram } from '../domain/model/diagram';
import { MermaidParser } from '../infrastructure/parser/MermaidParser';
import { todo } from '../todo';
import type { DiagramView } from './DiagramView';
import type { Snapshot } from './Snapshot';

export class SyncManager {
  private currentMetadata = new LayoutMetadata();
  private views: DiagramView[] = [];

  constructor(
    private readonly parser = new MermaidParser(),
    private readonly layoutEngineFactory = new LayoutEngineFactory(),
  ) {}

  addView(view: DiagramView): void {
    this.views.push(view);
  }

  onTextChanged(text: string): Promise<void> {
    return todo('M4');
  }

  onCanvasNodeMoved(nodeId: string, x: number, y: number): void {
    todo('M4');
  }

  onEdgeRouteChanged(edgeId: string, waypoints: Point[]): void {
    todo('M4');
  }

  onUnpin(nodeId: string): void {
    todo('M4');
  }

  /** 실행취소·버전 복원 시 Snapshot을 적용한다(설계서 D-02) */
  restore(snapshot: Snapshot): Promise<void> {
    return todo('M4');
  }

  /** 다시 파싱한 다이어그램에 기존 좌표·고정 정보를 옮겨 담고, 사라진 노드의 정보는 지운다 */
  private mergeMetadata(oldMeta: LayoutMetadata, newDiagram: AbstractDiagram): LayoutMetadata {
    return todo('M4');
  }

  private notifyViews(diagram: AbstractDiagram, layout: LayoutResult): void {
    for (const view of this.views) view.onDiagramUpdated(diagram, layout);
  }
}
