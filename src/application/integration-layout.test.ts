// 진짜 M1 파서 + 진짜 M2 레이아웃 엔진 + M4 흐름. 회의 09-23 시나리오와 성능을 확인한다.
import { describe, expect, it, vi } from 'vitest';
import { LayoutEngineFactory } from '../domain/layout/LayoutEngineFactory';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { NodePosition } from '../domain/metadata/geometry';
import { MermaidParser } from '../infrastructure/parser/MermaidParser';
import { inMemoryMetadataFactory } from '../testing/fakes';
import type { DiagramView } from './DiagramView';
import { SyncManager } from './SyncManager';

function setup() {
  const sync = new SyncManager(new MermaidParser(), new LayoutEngineFactory(), inMemoryMetadataFactory);
  const view = { onDiagramUpdated: vi.fn(), onParseError: vi.fn(), onTextRestored: vi.fn() } satisfies DiagramView;
  sync.addView(view);
  const lastLayout = (): LayoutResult => view.onDiagramUpdated.mock.lastCall![1];
  return { sync, lastLayout };
}

const overlaps = (a: NodePosition, b: NodePosition) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const ANIMALS = 'classDiagram\n  Animal <|-- Dog\n  Animal <|-- Cat\n  Animal <|-- Cow';

describe('M1 파서 + M2 레이아웃 + M4 흐름', () => {
  it('30노드 클래스 다이어그램이 1초 안에 배치된다 (인터뷰 Q6, NFR-01)', async () => {
    const { sync, lastLayout } = setup();
    const lines = ['classDiagram'];
    for (let i = 0; i < 30; i++) {
      lines.push(`  class C${i} {`, '    +String name', '    +run() void', '  }');
      if (i > 0) lines.push(`  C${Math.floor((i - 1) / 2)} <|-- C${i}`);
    }
    const start = performance.now();
    await sync.onTextChanged(lines.join('\n'));
    expect(performance.now() - start).toBeLessThan(1000);
    expect(lastLayout().nodePositions.size).toBe(30);
  });

  it('노드 하나를 빈 곳으로 옮겨도 다른 노드는 움직이지 않는다 (인터뷰 Q3)', async () => {
    const { sync, lastLayout } = setup();
    await sync.onTextChanged(ANIMALS);
    const before = lastLayout().nodePositions;
    await sync.onCanvasNodeMoved('Dog', 800, 600);
    const after = lastLayout().nodePositions;
    for (const id of ['Animal', 'Cat', 'Cow']) expect(after.get(id)).toEqual(before.get(id));
  });

  it('AC-3: 3개를 옮기고 3개를 추가하면 옮긴 3개는 0px 그대로, 새 노드는 겹치지 않는다', async () => {
    const { sync, lastLayout } = setup();
    await sync.onTextChanged(ANIMALS);
    await sync.onCanvasNodeMoved('Dog', 600, 0);
    await sync.onCanvasNodeMoved('Cat', 600, 200);
    await sync.onCanvasNodeMoved('Cow', 600, 400);
    await sync.onTextChanged(`${ANIMALS}\n  class Bird\n  class Fish\n  Animal <|-- Horse`);

    const layout = lastLayout().nodePositions;
    expect(layout.get('Dog')).toMatchObject({ x: 600, y: 0, isPinned: true });
    expect(layout.get('Cat')).toMatchObject({ x: 600, y: 200, isPinned: true });
    expect(layout.get('Cow')).toMatchObject({ x: 600, y: 400, isPinned: true });
    const all = [...layout.values()];
    for (const id of ['Bird', 'Fish', 'Horse']) {
      const p = layout.get(id)!;
      expect(all.filter((o) => o !== p && overlaps(p, o))).toEqual([]);
    }
  });

  it('시퀀스 다이어그램: 참여자는 가로로, 메시지는 순서대로 아래로 (인터뷰 Q6, FR-04-1)', async () => {
    const { sync, lastLayout } = setup();
    await sync.onTextChanged('sequenceDiagram\n  participant A\n  participant B\n  A->>B: 요청\n  B-->>A: 응답');
    const { nodePositions, edgeRoutes } = lastLayout();
    expect(nodePositions.get('A')!.x).toBeLessThan(nodePositions.get('B')!.x);
    const ys = [...edgeRoutes.values()].map((r) => r.waypoints[0].y);
    expect(ys).toHaveLength(2);
    expect(ys[0]).toBeLessThan(ys[1]);
  });
});
