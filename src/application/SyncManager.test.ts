import { describe, expect, it, vi } from 'vitest';
import type { LayoutEngine } from '../domain/layout/LayoutEngine';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import { FakeLayoutEngine, FakeLayoutEngineFactory, FakeParser, inMemoryMetadataFactory } from '../testing/fakes';
import type { DiagramView } from './DiagramView';
import { SyncManager } from './SyncManager';

function setup(engine: LayoutEngine = new FakeLayoutEngine()) {
  const sync = new SyncManager(new FakeParser(), new FakeLayoutEngineFactory(engine), inMemoryMetadataFactory);
  const view = { onDiagramUpdated: vi.fn(), onParseError: vi.fn() } satisfies DiagramView;
  sync.addView(view);
  const lastLayout = (): LayoutResult => view.onDiagramUpdated.mock.lastCall![1];
  return { sync, view, lastLayout };
}

describe('코드 변경', () => {
  it('파싱 → 배치 → 화면 알림 순서로 반영된다', async () => {
    const { sync, view, lastLayout } = setup();
    expect(await sync.onTextChanged('class A\nclass B\nA --> B')).toBe(true);
    expect(view.onDiagramUpdated).toHaveBeenCalledOnce();
    expect([...lastLayout().nodePositions.keys()]).toEqual(['A', 'B']);
  });

  it('문법 오류 중에는 오류만 알리고 캔버스는 마지막 정상 상태를 유지한다 (FR-03-5)', async () => {
    const { sync, view } = setup();
    await sync.onTextChanged('class A');
    expect(await sync.onTextChanged('class A\n!!')).toBe(false);
    expect(view.onParseError).toHaveBeenCalledWith([{ line: 2, column: 1, message: '가짜 문법 오류' }]);
    expect(view.onDiagramUpdated).toHaveBeenCalledOnce();
  });

  it('문법 오류가 잠깐 나도 고정 좌표는 사라지지 않는다', async () => {
    const { sync, lastLayout } = setup();
    await sync.onTextChanged('class A');
    await sync.onCanvasNodeMoved('A', 500, 300);
    await sync.onTextChanged('class A\n!!');
    await sync.onTextChanged('class A\nclass B');
    expect(lastLayout().nodePositions.get('A')).toMatchObject({ x: 500, y: 300, isPinned: true });
  });

  it('코드에서 지운 노드의 좌표는 메타데이터에서도 지워진다 (FR-03-8)', async () => {
    const { sync } = setup();
    await sync.onTextChanged('class A\nclass B');
    await sync.onCanvasNodeMoved('B', 10, 10);
    await sync.onTextChanged('class A');
    expect(sync.metadata.getPosition('B')).toBeUndefined();
  });
});

describe('마우스 변경', () => {
  it('드래그한 노드는 고정되고, Mermaid 코드는 한 글자도 바뀌지 않는다 (FR-03-2, FR-04-2)', async () => {
    const { sync, lastLayout } = setup();
    const code = 'class A\nclass B';
    await sync.onTextChanged(code);
    expect(await sync.onCanvasNodeMoved('A', 500, 300)).toBe(true);
    expect(sync.text).toBe(code);
    expect(sync.metadata.getPosition('A')).toEqual({ x: 500, y: 300, width: 160, height: 80, isPinned: true });
    expect(lastLayout().nodePositions.get('A')).toMatchObject({ x: 500, y: 300 });
  });

  it('노드를 추가해도 고정된 노드는 그 자리에 있다 (FR-04-3, 회의 09-23 시나리오)', async () => {
    const { sync, lastLayout } = setup();
    await sync.onTextChanged('class A\nclass B');
    await sync.onCanvasNodeMoved('B', 777, 333);
    await sync.onTextChanged('class C\nclass D\nclass A\nclass B');
    const layout = lastLayout();
    expect(layout.nodePositions.get('B')).toMatchObject({ x: 777, y: 333, isPinned: true });
    expect(layout.nodePositions.has('C')).toBe(true);
    expect(layout.nodePositions.has('D')).toBe(true);
  });

  it('손으로 고친 간선 경로는 코드를 고쳐도 유지된다 (FR-04-7)', async () => {
    const { sync, lastLayout } = setup();
    await sync.onTextChanged('class A\nclass B\nA --> B');
    await sync.onEdgeRouteChanged('A-->B', [{ x: 50, y: 200 }]);
    await sync.onTextChanged('class A\nclass B\nclass C\nA --> B');
    expect(lastLayout().edgeRoutes.get('A-->B')).toEqual({ waypoints: [{ x: 50, y: 200 }], isManual: true });
  });

  it('고정을 풀면 자동 배치 위치로 돌아간다 (FR-04-4)', async () => {
    const { sync, lastLayout } = setup();
    await sync.onTextChanged('class A');
    await sync.onCanvasNodeMoved('A', 500, 300);
    expect(await sync.onUnpin('A')).toBe(true);
    expect(lastLayout().nodePositions.get('A')).toMatchObject({ x: 0, y: 0, isPinned: false });
  });

  it('없는 노드·간선에 대한 마우스 이벤트는 무시한다', async () => {
    const { sync, view } = setup();
    expect(await sync.onCanvasNodeMoved('A', 1, 1)).toBe(false);
    await sync.onTextChanged('class A');
    expect(await sync.onCanvasNodeMoved('Z', 1, 1)).toBe(false);
    expect(await sync.onEdgeRouteChanged('A-->Z', [])).toBe(false);
    expect(await sync.onUnpin('A')).toBe(false);
    expect(view.onDiagramUpdated).toHaveBeenCalledOnce();
  });
});

describe('비동기 순서', () => {
  it('늦게 끝난 옛 배치 결과가 새 결과를 덮어쓰지 않는다', async () => {
    const fake = new FakeLayoutEngine();
    const delays = [50, 0];
    const slowFirst: LayoutEngine = {
      async applyLayout(diagram, metadata) {
        await new Promise((r) => setTimeout(r, delays.shift()));
        return fake.applyLayout(diagram, metadata);
      },
    };
    const { sync, view, lastLayout } = setup(slowFirst);
    const first = sync.onTextChanged('class A');
    const second = sync.onTextChanged('class A\nclass B');
    expect(await second).toBe(true);
    expect(await first).toBe(false);
    expect(view.onDiagramUpdated).toHaveBeenCalledOnce();
    expect(lastLayout().nodePositions.has('B')).toBe(true);
  });
});

describe('복원', () => {
  it('Snapshot의 코드와 좌표를 함께 되돌린다 (D-02)', async () => {
    const { sync, lastLayout } = setup();
    await sync.onTextChanged('class A');
    await sync.onCanvasNodeMoved('A', 500, 300);
    const saved = { id: 's', textState: sync.text, metadataState: sync.metadata.toJson(), timestamp: new Date() };

    await sync.onTextChanged('class A\nclass B');
    await sync.onUnpin('A');
    await sync.restore(saved);

    expect(sync.text).toBe('class A');
    expect(lastLayout().nodePositions.get('A')).toMatchObject({ x: 500, y: 300, isPinned: true });
  });
});
