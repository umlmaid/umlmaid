// 담당: M4 동기화·흐름
// «Observer» SyncManager가 결과를 알리는 규약. 화면(M5)이 구현한다.
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { AbstractDiagram } from '../domain/model/diagram';
import type { ParseError } from '../infrastructure/parser/ParseResult';

export interface DiagramView {
  onDiagramUpdated(diagram: AbstractDiagram, layout: LayoutResult): void;
  onParseError(errors: ParseError[]): void;
}
