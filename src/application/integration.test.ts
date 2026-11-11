// 진짜 부품끼리 이어 붙인 흐름 테스트. 모듈이 완성될 때마다 가짜를 진짜로 바꿔 간다.
// 여기서는 레이아웃을 가짜로 둬서 좌표를 예상하기 쉽게 한다. 진짜 레이아웃은 integration-layout.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import { ClassNode } from '../domain/model/nodes';
import { MermaidParser } from '../infrastructure/parser/MermaidParser';
import { FakeLayoutEngineFactory, inMemoryMetadataFactory } from '../testing/fakes';
import type { DiagramView } from './DiagramView';
import { SyncManager } from './SyncManager';

function setup() {
  const sync = new SyncManager(new MermaidParser(), new FakeLayoutEngineFactory(), inMemoryMetadataFactory);
  const view = { onDiagramUpdated: vi.fn(), onParseError: vi.fn(), onTextRestored: vi.fn() } satisfies DiagramView;
  sync.addView(view);
  const lastLayout = (): LayoutResult => view.onDiagramUpdated.mock.lastCall![1];
  return { sync, view, lastLayout };
}

describe('M1 파서 + M4 흐름', () => {
  it('회의 09-23 시나리오: 배치 → 드래그 고정 → 노드 2개 추가 → 고정 노드 그대로 (인터뷰 Q3)', async () => {
    const { sync, lastLayout } = setup();
    await sync.onTextChanged('classDiagram\n  Animal <|-- Dog\n  Animal <|-- Cat');
    await sync.onCanvasNodeMoved('Dog', 640, 420);

    await sync.onTextChanged('classDiagram\n  Animal <|-- Dog\n  Animal <|-- Cat\n  class Bird\n  class Fish');

    const layout = lastLayout();
    expect(layout.nodePositions.get('Dog')).toMatchObject({ x: 640, y: 420, isPinned: true });
    expect(layout.nodePositions.has('Bird')).toBe(true);
    expect(layout.nodePositions.has('Fish')).toBe(true);
  });

  it('드래그해도 Mermaid 코드는 그대로다 (인터뷰 Q9)', async () => {
    const { sync } = setup();
    const code = 'classDiagram\n  class A\n  A --> B';
    await sync.onTextChanged(code);
    await sync.onCanvasNodeMoved('A', 10, 10);
    expect(sync.text).toBe(code);
  });

  it('손으로 고친 간선 경로가 진짜 파서의 간선 id로 유지된다 (인터뷰 Q8)', async () => {
    const { sync, lastLayout } = setup();
    await sync.onTextChanged('classDiagram\n  A --> B');
    const [edge] = [...lastLayout().edgeRoutes.keys()];
    await sync.onCanvasEdgeRouteChanged(edge, [{ x: 30, y: 300 }]);
    await sync.onTextChanged('classDiagram\n  A --> B\n  class C');
    expect(lastLayout().edgeRoutes.get(edge)).toEqual({ waypoints: [{ x: 30, y: 300 }], isManual: true });
  });

  it('문법 오류는 줄 번호와 함께 알리고, 캔버스는 직전 그림을 유지한다 (FR-01-3, FR-03-5)', async () => {
    const { sync, view } = setup();
    await sync.onTextChanged('classDiagram\n  class A');
    await sync.onTextChanged('classDiagram\n  class A\n  이건 문법이 아님');
    const [errors] = view.onParseError.mock.lastCall!;
    expect(errors[0].line).toBe(3);
    expect(view.onDiagramUpdated).toHaveBeenCalledOnce();
  });

  it('코드에서 클래스 이름을 바꾸면 옛 이름의 고정 좌표는 지워진다 (FR-03-8)', async () => {
    const { sync } = setup();
    await sync.onTextChanged('classDiagram\n  class Old');
    await sync.onCanvasNodeMoved('Old', 99, 99);
    await sync.onTextChanged('classDiagram\n  class New');
    expect(sync.metadata.getPosition('Old')).toBeUndefined();
  });

  it('30노드 파싱 + 흐름이 1초 안에 끝난다 (NFR-01, 진짜 레이아웃 포함은 integration-layout.test.ts)', async () => {
    const { sync, lastLayout } = setup();
    const lines = ['classDiagram'];
    for (let i = 0; i < 30; i++) {
      lines.push(`  class C${i} {`, '    +String name', '    +run() void', '  }');
      if (i > 0) lines.push(`  C${i - 1} <|-- C${i}`);
    }
    const start = performance.now();
    await sync.onTextChanged(lines.join('\n'));
    expect(performance.now() - start).toBeLessThan(1000);
    expect(lastLayout().nodePositions.size).toBe(30);
  });

  it('인터페이스 스테레오타입을 가진 클래스도 노드가 된다', async () => {
    const { sync, view } = setup();
    await sync.onTextChanged('classDiagram\n  class Shape {\n    <<interface>>\n    +draw() void\n  }');
    const [diagram] = view.onDiagramUpdated.mock.lastCall!;
    expect(diagram.getNode('Shape')).toBeInstanceOf(ClassNode);
  });
});
