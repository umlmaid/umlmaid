// 담당: M5 화면 — src/App.tsx에 적용한다.
// 파일 형식/좌표 직렬화/이미지 변환은 Workspace를 통해 M6에 맡긴다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { createWorkspace } from './composition';
import { ImageFormat } from './infrastructure/export/ImageExporter';
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

/** M6에서 받은 결과를 브라우저 다운로드로 전달한다. 파일 내용은 여기서 만들지 않는다. */
function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    try { link.click(); }
    finally {
        link.remove();
        // 브라우저가 다운로드 요청을 읽은 뒤 임시 URL을 해제한다.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

function imageFilename(projectName: string, format: ImageFormat): string {
    const stem = projectName.replace(/\.(mmd|mermaid|txt)$/i, '') || 'umlmaid';
    return `${stem}.${format === ImageFormat.PNG ? 'png' : 'jpg'}`;
}

export function App() {
    const workspace = useMemo(() => createWorkspace(), []);
    const controller = useMemo(() => new DragController(workspace), [workspace]);
    const [code, setCode] = useState(SAMPLE);
    const [filename, setFilename] = useState('umlmaid.mmd');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [parsing, setParsing] = useState(true);
    const [history, setHistory] = useState({ undo: false, redo: false });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRegionRef = useRef<HTMLDivElement>(null);
    const pendingFilenameRef = useRef<string | undefined>(undefined);
    const actionLockRef = useRef(false);
    const editRevisionRef = useRef(0);

    // 파일 열기나 실행취소로 복원된 텍스트를 editCode에 다시 보내지 않는다.
    const onTextRestored = useCallback((text: string) => {
        setCode(text);
        if (pendingFilenameRef.current) setFilename(pendingFilenameRef.current);
    }, []);
    const { diagram, layout, errors } = useDiagramView(workspace, onTextRestored);

    const refreshHistory = useCallback(() => {
        setHistory({ undo: workspace.canUndo, redo: workspace.canRedo });
    }, [workspace]);

    const report = useCallback((error: unknown) => {
        const text = error instanceof Error ? error.message : '작업을 완료하지 못했습니다.';
        setMessage(/^TODO\(M\d+\)/.test(text) ? '이 기능은 아직 준비 중입니다. 구현이 연결된 뒤 다시 시도해 주세요.' : text);
    }, []);

    const applyCode = useCallback(async (text: string) => {
        const revision = ++editRevisionRef.current;
        setParsing(true);
        try { await workspace.editCode(text); }
        catch (error) { if (revision === editRevisionRef.current) report(error); }
        finally {
            if (revision === editRevisionRef.current) { setParsing(false); refreshHistory(); }
        }
    }, [workspace, report, refreshHistory]);

    useEffect(() => { void applyCode(SAMPLE); }, [applyCode]);
    useEffect(() => { refreshHistory(); }, [diagram, layout, refreshHistory]);

    const edit = (text: string) => {
        setCode(text);
        setMessage('');
        void applyCode(text);
    };

    const runAction = async (name: string, action: () => Promise<void>) => {
        // React가 버튼의 disabled를 반영하기 전 연속 클릭도 중복 실행하지 않는다.
        if (actionLockRef.current) return;
        actionLockRef.current = true;
        setBusy(name);
        setMessage('');
        try { await action(); }
        catch (error) { report(error); }
        finally {
            actionLockRef.current = false;
            setBusy(null);
            refreshHistory();
        }
    };

    const save = () => runAction('저장', async () => {
        const blob = await workspace.saveProject();
        downloadBlob(blob, filename);
    });

    const openFile = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.currentTarget.files?.[0];
        // 같은 파일을 다시 선택해도 change 이벤트가 발생하도록 즉시 초기화한다.
        event.currentTarget.value = '';
        if (!file) return;
        void runAction('파일 열기', async () => {
            pendingFilenameRef.current = file.name;
            try { await workspace.loadProject(file); }
            finally { pendingFilenameRef.current = undefined; }
        });
    };

    const canExport = !!diagram?.nodes.length && !!layout && errors.length === 0 && !parsing && !busy;
    const exportImage = (format: ImageFormat) => {
        if (!canExport) return;
        void runAction('이미지 내보내기', async () => {
            const svg = canvasRegionRef.current?.querySelector('svg');
            if (!(svg instanceof SVGSVGElement)) throw new Error('내보낼 다이어그램이 없습니다.');
            // 클릭 시점의 SVG 복사본을 전달한다. 줌 컨테이너·HTML 고정 버튼은 포함되지 않는다.
            const snapshot = svg.cloneNode(true) as SVGSVGElement;
            snapshot.querySelectorAll('[data-export-exclude="true"]').forEach((element) => element.remove());
            const blob = await workspace.exportToImage(snapshot, format);
            downloadBlob(blob, imageFilename(filename, format));
        });
    };

    return (
        <>
            <style>{`
        body { margin: 0; }
        .uml-app { display: grid; grid-template-columns: minmax(280px, 1fr) minmax(0, 2fr); gap: 8px; height: 100dvh; padding: 8px; box-sizing: border-box; background: #f5f6f8; color: #17212b; font-family: sans-serif; }
        .uml-app button { font: inherit; padding: 5px 9px; }
        .uml-app button:disabled { cursor: default; }
        .uml-app .canvas-viewport { flex: 1; }
        @media (max-width: 760px) { .uml-app { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(300px, 1fr) minmax(260px, 1fr); overflow: auto; } }
      `}</style>
            <main className="uml-app">
                <section aria-label="코드 편집" aria-busy={busy !== null} style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: 'white' }}>
                    <div role="group" aria-label="파일 동작" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 8px 4px' }}>
                        <button type="button" disabled={!!busy} onClick={() => void save()}>저장</button>
                        <button type="button" disabled={!!busy || parsing} onClick={() => fileInputRef.current?.click()}>열기</button>
                        <button type="button" disabled={!canExport} onClick={() => exportImage(ImageFormat.PNG)}>PNG 내보내기</button>
                        <button type="button" disabled={!canExport} onClick={() => exportImage(ImageFormat.JPEG)}>JPEG 내보내기</button>
                        <input ref={fileInputRef} type="file" aria-label="프로젝트 파일 선택" accept=".mmd,.mermaid,.txt,text/plain" hidden onChange={openFile} />
                    </div>
                    <div role="group" aria-label="편집 동작" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 8px 8px' }}>
                        <button type="button" disabled={!!busy || parsing || !history.undo} onClick={() => void runAction('실행취소', () => workspace.undo())}>실행취소</button>
                        <button type="button" disabled={!!busy || parsing || !history.redo} onClick={() => void runAction('다시실행', () => workspace.redo())}>다시실행</button>
                        <button type="button" disabled={!!busy || parsing} onClick={() => void runAction('고정 해제', () => workspace.unpinAll())}>전체 고정 해제</button>
                    </div>
                    <div role="status" aria-live="polite" title={filename} style={{ padding: '2px 10px 6px', fontSize: 12, color: '#59636f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{busy ? `${busy} 중…` : filename}</div>
                    {message && <div role="alert" style={{ padding: '8px 12px', color: '#a01724', background: '#fff1f2', fontSize: 13, overflowWrap: 'anywhere' }}>{message}</div>}
                    <fieldset disabled={!!busy} style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, border: 0, padding: 0, margin: 0 }}>
                        <TextEditor value={code} onChange={edit} errors={errors} />
                    </fieldset>
                </section>
                <div ref={canvasRegionRef} inert={busy !== null} style={{ display: 'flex', minWidth: 0, minHeight: 0 }}>
                    <CanvasViewport diagram={diagram} layout={layout} controller={controller} />
                </div>
            </main>
        </>
    );
}
