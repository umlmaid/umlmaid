// 진짜 M1 파서 + 진짜 M2 레이아웃 엔진 + 진짜 M3 좌표 + M4 흐름. 회의 09-23 시나리오와 성능을 확인한다.
import { describe, expect, it, vi } from 'vitest';
import { LayoutEngineFactory } from '../domain/layout/LayoutEngineFactory';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { NodePosition } from '../domain/metadata/geometry';
import { MermaidParser } from '../infrastructure/parser/MermaidParser';
import type { DiagramView } from './DiagramView';
import { SyncManager } from './SyncManager';

function setup() {
  const sync = new SyncManager(new MermaidParser(), new LayoutEngineFactory());
  const view = { onDiagramUpdated: vi.fn(), onParseError: vi.fn(), onTextRestored: vi.fn() } satisfies DiagramView;
  sync.addView(view);
  const lastLayout = (): LayoutResult => view.onDiagramUpdated.mock.lastCall![1];
  const lastDiagram = () => view.onDiagramUpdated.mock.lastCall![0];
  return { sync, lastLayout, lastDiagram };
}

const overlaps = (a: NodePosition, b: NodePosition) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** 선(노드 가운데 → 꺾임점 → 노드 가운데)이 양 끝이 아닌 다른 상자를 지나가는지 */
function edgesThroughBoxes(diagram: { edges: { id: string; sourceId: string; targetId: string }[] }, layout: LayoutResult): string[] {
  const center = (p: NodePosition) => ({ x: p.x + p.width / 2, y: p.y + p.height / 2 });
  const hits: string[] = [];
  for (const e of diagram.edges) {
    const s = layout.nodePositions.get(e.sourceId)!;
    const t = layout.nodePositions.get(e.targetId)!;
    const pts = [center(s), ...(layout.edgeRoutes.get(e.id)?.waypoints ?? []), center(t)];
    for (const [id, box] of layout.nodePositions) {
      if (id === e.sourceId || id === e.targetId) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        // 선분을 잘게 나눠 상자 안에 들어가는 점이 있는지 본다
        for (let k = 0; k <= 50; k++) {
          const x = pts[i].x + ((pts[i + 1].x - pts[i].x) * k) / 50;
          const y = pts[i].y + ((pts[i + 1].y - pts[i].y) * k) / 50;
          if (x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height) {
            hits.push(`${e.id} → ${id}`);
            k = 51;
            i = pts.length;
          }
        }
      }
    }
  }
  return hits;
}

/** Animal 상자 위치 */

const ANIMALS = 'classDiagram\n  Animal <|-- Dog\n  Animal <|-- Cat\n  Animal <|-- Cow';

describe('M1 파서 + M2 레이아웃 + M3 좌표 + M4 흐름', () => {
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

  it('선을 꺾은 뒤 클래스를 추가해도 양 끝 노드와 꺾임점이 그대로다 (인터뷰 Q8, FR-04-7)', async () => {
    const { sync, lastLayout } = setup();
    await sync.onTextChanged(ANIMALS);
    const before = lastLayout().nodePositions;
    await sync.onCanvasEdgeRouteChanged('Cat-INHERITANCE-Animal', [{ x: 400, y: 150 }]);
    await sync.onTextChanged(`${ANIMALS}\n  class Bird`);
    await sync.onTextChanged(`${ANIMALS}\n  class Bird\n  Animal <|-- Bird`);
    const after = lastLayout();
    for (const id of ['Animal', 'Cat']) expect(after.nodePositions.get(id)).toMatchObject({ x: before.get(id)!.x, y: before.get(id)!.y });
    expect(after.edgeRoutes.get('Cat-INHERITANCE-Animal')?.waypoints).toEqual([{ x: 400, y: 150 }]);
  });

  it('고정 노드가 생겨도 선이 다른 상자를 지나가지 않는다 (인터뷰 Q8, 추가 요구: 간선 꼬임)', async () => {
    const { sync, lastLayout, lastDiagram } = setup();
    await sync.onTextChanged(ANIMALS);
    await sync.onCanvasEdgeRouteChanged('Cat-INHERITANCE-Animal', [{ x: 400, y: 150 }]);
    await sync.onTextChanged(`${ANIMALS}\n  class Bird\n  Animal <|-- Bird`);
    expect(edgesThroughBoxes(lastDiagram(), lastLayout())).toEqual([]);
    // 노드를 다른 선 위(Animal과 Cow 사이 빈자리)로 끌어다 놓은 경우도
    const pos = lastLayout().nodePositions;
    const mid = (id: string) => ({ x: pos.get(id)!.x + pos.get(id)!.width / 2, y: pos.get(id)!.y + pos.get(id)!.height / 2 });
    const bird = pos.get('Bird')!;
    const x = (mid('Animal').x + mid('Cow').x) / 2 - bird.width / 2;
    const y = (mid('Animal').y + mid('Cow').y) / 2 - bird.height / 2;
    await sync.onCanvasNodeMoved('Bird', x, y);
    const moved = lastLayout().nodePositions;
    expect([...moved].filter(([id, p]) => id !== 'Bird' && overlaps(p, moved.get('Bird')!))).toEqual([]);
    expect(edgesThroughBoxes(lastDiagram(), lastLayout())).toEqual([]);
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

  // 인터뷰: "새 객체가 추가될 때 적절한 위치로 자동 배치되지만 기존 객체의 배치가 바뀌면 안됨"
  const additions: [string, string, string][] = [
    ['자식 추가', ANIMALS, '\n  Animal <|-- Bird'],
    ['새 부모 추가', ANIMALS, '\n  LivingThing <|-- Animal'],
    ['연결 없는 객체 추가', ANIMALS, '\n  class Zoo'],
    ['여러 단계 구조에 추가', 'classDiagram\n  A <|-- B\n  A <|-- C\n  B <|-- D\n  C <|-- E\n  D --> E', '\n  B <|-- F'],
  ];
  for (const [name, before, added] of additions) {
    it(`객체를 추가해도 손대지 않은 기존 객체는 움직이지 않고, 새 객체는 겹치지 않는다: ${name}`, async () => {
      const { sync, lastLayout } = setup();
      await sync.onTextChanged(before);
      const prev = new Map(lastLayout().nodePositions);
      await sync.onTextChanged(before + added);
      const next = lastLayout().nodePositions;
      for (const [id, p] of prev) expect(next.get(id), id).toMatchObject({ x: p.x, y: p.y });
      for (const [id, p] of next) {
        if (prev.has(id)) continue;
        for (const [other, q] of next) if (other !== id) expect(overlaps(p, q), `${id}·${other}`).toBe(false);
      }
    });
  }

  it('전체 고정 해제를 누르면 처음부터 다시 배치한다 (FR-04-4)', async () => {
    const { sync, lastLayout } = setup();
    await sync.onTextChanged(ANIMALS);
    const fresh = new Map(lastLayout().nodePositions);
    await sync.onTextChanged('classDiagram\n  class Zoo\n  Animal <|-- Dog\n  Animal <|-- Cat\n  Animal <|-- Cow');
    await sync.onTextChanged(ANIMALS);
    await sync.onCanvasNodeMoved('Dog', 600, 0);
    expect(await sync.unpinAll()).toBe(true);
    for (const [id, p] of fresh) expect(lastLayout().nodePositions.get(id), id).toMatchObject({ x: p.x, y: p.y, isPinned: false });
  });
});
