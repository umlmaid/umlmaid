// 담당: M4 동기화·흐름
// «Observer» React 화면을 DiagramView로 등록하고, 받은 결과를 상태로 돌려준다.
import { useEffect, useState } from 'react';
import type { DiagramView } from '../application/DiagramView';
import type { Workspace } from '../application/Workspace';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { AbstractDiagram } from '../domain/model/diagram';
import type { ParseError } from '../infrastructure/parser/ParseResult';

export interface DiagramViewState {
  /** 마지막으로 그릴 수 있었던 다이어그램. 문법 오류 중에도 남아 있다(FR-03-5). */
  diagram?: AbstractDiagram;
  layout?: LayoutResult;
  /** 비어 있으면 오류 없음 */
  errors: ParseError[];
}

export function useDiagramView(workspace: Workspace): DiagramViewState {
  const [state, setState] = useState<DiagramViewState>({ errors: [] });
  useEffect(() => {
    const view: DiagramView = {
      onDiagramUpdated: (diagram, layout) => setState({ diagram, layout, errors: [] }),
      onParseError: (errors) => setState((prev) => ({ ...prev, errors })),
    };
    workspace.syncManager.addView(view);
    return () => workspace.syncManager.removeView(view);
  }, [workspace]);
  return state;
}
