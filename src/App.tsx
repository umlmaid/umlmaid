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
  const { diagram, layout, errors } = useDiagramView(workspace);
  const [code, setCode] = useState(SAMPLE);

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
      <TextEditor value={code} onChange={edit} errors={errors} />
      <div style={{ overflow: 'auto' }}>
        <CanvasRenderer diagram={diagram} layout={layout} />
      </div>
    </div>
  );
}
