import { useEffect, useMemo, useState } from 'react';
import { createWorkspace } from './composition';
import { CanvasRenderer } from './presentation/CanvasRenderer';
import { TextEditor } from './presentation/TextEditor';
import { useDiagramView } from './presentation/useDiagramView';

const SAMPLE = `classDiagram
  class Animal {
    +String name
    +eat() void
  }
  class Dog
  class Cat
  Animal <|-- Dog
  Animal <|-- Cat`;

export function App() {
  const workspace = useMemo(() => createWorkspace(), []);
  const [code, setCode] = useState(SAMPLE);
  // 실행취소·파일 열기 때 편집기 글자만 바꾼다(setTextSilently 역할)
  const { diagram, layout, errors } = useDiagramView(workspace, setCode);

  // 첫 화면에 예제를 그린다
  useEffect(() => {
    void workspace.editCode(SAMPLE);
  }, [workspace]);

  const edit = (text: string) => {
    setCode(text);
    void workspace.editCode(text);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', height: '100vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* 임시 버튼. M5가 화면을 만들면 바꾼다 */}
        <div style={{ display: 'flex', gap: 4, padding: 4 }}>
          <button disabled={!workspace.canUndo} onClick={() => void workspace.undo()}>실행취소</button>
          <button disabled={!workspace.canRedo} onClick={() => void workspace.redo()}>다시실행</button>
          <button onClick={() => void workspace.unpinAll()}>전체 고정 해제</button>
        </div>
        <TextEditor value={code} onChange={edit} errors={errors} />
      </div>
      <div style={{ overflow: 'auto' }}>
        <CanvasRenderer diagram={diagram} layout={layout} />
      </div>
    </div>
  );
}
