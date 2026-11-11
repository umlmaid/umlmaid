// 담당: M5 화면 — src/App.tsx에 적용한다.
import { useEffect, useMemo, useState } from 'react';
import { createWorkspace } from './composition';
import { CanvasViewport } from './presentation/CanvasViewport';
import { DragController } from './presentation/DragController';
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
    const controller = useMemo(() => new DragController(workspace), [workspace]);
    const [code, setCode] = useState(SAMPLE);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [history, setHistory] = useState({ undo: false, redo: false });
    const { diagram, layout, errors } = useDiagramView(workspace, setCode);

    const refreshHistory = () => setHistory({ undo: workspace.canUndo, redo: workspace.canRedo });
    const report = (error: unknown) => setMessage(error instanceof Error ? error.message : '작업을 완료하지 못했습니다.');

    useEffect(() => {
        void workspace.editCode(SAMPLE).then(refreshHistory, report);
    }, [workspace]);
    useEffect(() => { refreshHistory(); }, [workspace, diagram, layout]);

    const edit = (text: string) => {
        setCode(text);
        setMessage('');
        void workspace.editCode(text).then(refreshHistory, report);
    };

    const runAction = async (action: () => Promise<void>) => {
        setBusy(true);
        setMessage('');
        try { await action(); }
        catch (error) { report(error); }
        finally { setBusy(false); refreshHistory(); }
    };

    return (
        <>
            <style>{`
        body { margin: 0; }
        .uml-app { display: grid; grid-template-columns: minmax(280px, 1fr) minmax(0, 2fr); gap: 8px; height: 100dvh; padding: 8px; box-sizing: border-box; background: #f5f6f8; color: #17212b; font-family: sans-serif; }
        .uml-app button { font: inherit; padding: 5px 9px; }
        .uml-app button:disabled { cursor: default; }
        @media (max-width: 760px) { .uml-app { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(260px, 1fr) minmax(260px, 1fr); overflow: auto; } }
      `}</style>
            <main className="uml-app">
                <section aria-label="코드 편집" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: 'white' }}>
                    <div role="group" aria-label="편집 동작" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 8 }}>
                        <button type="button" disabled={busy || !history.undo} onClick={() => void runAction(() => workspace.undo())}>실행취소</button>
                        <button type="button" disabled={busy || !history.redo} onClick={() => void runAction(() => workspace.redo())}>다시실행</button>
                        <button type="button" disabled={busy} onClick={() => void runAction(() => workspace.unpinAll())}>전체 고정 해제</button>
                    </div>
                    {message && <div role="alert" style={{ padding: '8px 12px', color: '#a01724', background: '#fff1f2', fontSize: 13 }}>{message}</div>}
                    <TextEditor value={code} onChange={edit} errors={errors} />
                </section>
                <CanvasViewport diagram={diagram} layout={layout} controller={controller} />
            </main>
        </>
    );
}
