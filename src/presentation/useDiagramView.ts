// 담당: M4 동기화·흐름
// «Observer» React 화면을 DiagramView로 등록하고, 받은 결과를 상태로 돌려준다.
import { useEffect, useState } from 'react';
import type { DiagramView } from '../application/DiagramView';
import type { Workspace } from '../application/Workspace';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { AbstractDiagram } from '../domain/model/diagram';
import type { SyntaxError } from '../infrastructure/parser/ParseResult';

export interface DiagramViewState {
  /** 마지막으로 그릴 수 있었던 다이어그램. 문법 오류 중에도 남아 있다(FR-03-5). */
  diagram?: AbstractDiagram;
  layout?: LayoutResult;
  /** 비어 있으면 오류 없음 */
  errors: SyntaxError[];
}

/** onTextRestored: 실행취소·파일 열기로 코드가 바뀌면 편집기 글자를 바꾼다(editCode를 다시 부르지 않는다) */
export function useDiagramView(workspace: Workspace, onTextRestored: (text: string) => void): DiagramViewState {
  const [state, setState] = useState<DiagramViewState>({ errors: [] });
  useEffect(() => {
    const view: DiagramView = {
      onDiagramUpdated: (diagram, layout) => setState({ diagram, layout, errors: [] }),
      onParseError: (errors) => setState((prev) => ({ ...prev, errors })),
      onTextRestored,
    };
    workspace.syncManager.addView(view);
    return () => workspace.syncManager.removeView(view);
  }, [workspace, onTextRestored]);
  return state;
}
