// 담당: M4 동기화·흐름
// «Observer» SyncManager가 결과를 알리는 규약. 화면(M5)이 구현한다.
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { AbstractDiagram } from '../domain/model/diagram';
import type { SyntaxError } from '../infrastructure/parser/ParseResult';

export interface DiagramView {
  onDiagramUpdated(diagram: AbstractDiagram, layout: LayoutResult): void;
  onParseError(errors: SyntaxError[]): void;
  /**
   * 실행취소·파일 열기로 코드가 통째로 바뀌었을 때. 편집기는 받은 글자를 그대로 보여 주되
   * 새 편집으로 다시 보내지 않는다(TextEditor.setTextSilently). 드래그로는 불리지 않는다(FR-03-2).
   */
  onTextRestored(text: string): void;
}
