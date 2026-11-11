// 담당: M2 레이아웃 엔진
// LayoutMetadata(M3)가 아직 todo라서, 테스트에서는 읽기 메서드만 가짜로 바꿔 쓴다.
import { describe, expect, it } from 'vitest';
import type { EdgeRoute, NodePosition } from '../metadata/geometry';
import { LayoutMetadata } from '../metadata/LayoutMetadata';
import { AbstractDiagram } from '../model/diagram';
import { RelationEdge } from '../model/edges';
import { ClassNode } from '../model/nodes';
import { DiagramType, RelationType } from '../model/types';
import { LayeredLayoutEngine } from './LayeredLayoutEngine';
import { LayoutEngineFactory } from './LayoutEngineFactory';
import { SequenceLayoutEngine } from './SequenceLayoutEngine';

function metaWith(pins: Record<string, NodePosition> = {}, routes: Record<string, EdgeRoute> = {}): LayoutMetadata {
  const md = new LayoutMetadata();
  md.getPosition = (id) => pins[id];
  md.getEdgeRoute = (id) => routes[id];
  return md;
}
const overlap = (a: NodePosition, b: NodePosition) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('LayoutEngineFactory', () => {
  it('종류에 맞는 엔진을 돌려준다', () => {
    const f = new LayoutEngineFactory();
    expect(f.forType(DiagramType.CLASS)).toBeInstanceOf(LayeredLayoutEngine);
    expect(f.forType(DiagramType.SEQUENCE)).toBeInstanceOf(SequenceLayoutEngine);
  });
});

describe('LayeredLayoutEngine', () => {
  const engine = new LayeredLayoutEngine();
  const diagram = () =>
    new AbstractDiagram(
      DiagramType.CLASS,
      [new ClassNode('A', 'Animal', ['name'], ['eat()'], 'abstract'), new ClassNode('B', 'Dog'), new ClassNode('C', '고립노드')],
      [new RelationEdge('e1', 'B', 'A', RelationType.INHERITANCE)],
    );

  it('연결선 없는 노드도 위치가 있다', async () => {
    const r = await engine.applyLayout(diagram(), metaWith());
    expect([...r.nodePositions.keys()].sort()).toEqual(['A', 'B', 'C']);
  });

  it('고정 노드의 x, y는 그대로다', async () => {
    const pin: NodePosition = { x: 500, y: 700, width: 1, height: 1, isPinned: true };
    const r = await engine.applyLayout(diagram(), metaWith({ B: pin }));
    expect(r.nodePositions.get('B')).toMatchObject({ x: 500, y: 700, isPinned: true });
  });

  it('고정 노드 자리에 다른 노드가 겹치지 않는다', async () => {
    const free = await engine.applyLayout(diagram(), metaWith());
    const a = free.nodePositions.get('A')!;
    const pin: NodePosition = { ...a, isPinned: true }; // A를 ELK가 둘 만한 자리에 고정
    const r = await engine.applyLayout(diagram(), metaWith({ C: pin }));
    expect(overlap(r.nodePositions.get('C')!, r.nodePositions.get('A')!)).toBe(false);
    expect(overlap(r.nodePositions.get('C')!, r.nodePositions.get('B')!)).toBe(false);
  });

  it('상속은 부모(target)가 자식(source)보다 위에 놓인다', async () => {
    const r = await engine.applyLayout(diagram(), metaWith()); // e1: B(자식) -> A(부모)
    expect(r.nodePositions.get('A')!.y).toBeLessThan(r.nodePositions.get('B')!.y);
  });

  it('연관은 source가 target보다 위에 놓인다', async () => {
    const d = new AbstractDiagram(DiagramType.CLASS, [new ClassNode('X', 'X'), new ClassNode('Y', 'Y')], [
      new RelationEdge('a1', 'X', 'Y', RelationType.ASSOCIATION),
    ]);
    const r = await engine.applyLayout(d, metaWith());
    expect(r.nodePositions.get('X')!.y).toBeLessThan(r.nodePositions.get('Y')!.y);
  });

  it('뒤집어 배치한 간선도 꺾임점이 source에서 target 순서다', async () => {
    // C -> B -> A 상속 사슬에 C -> A 간선을 더하면 층을 건너뛰는 간선에 꺾임점이 생긴다
    const d = new AbstractDiagram(
      DiagramType.CLASS,
      [new ClassNode('A', 'A'), new ClassNode('B', 'B'), new ClassNode('C', 'C')],
      [
        new RelationEdge('ba', 'B', 'A', RelationType.INHERITANCE),
        new RelationEdge('cb', 'C', 'B', RelationType.INHERITANCE),
        new RelationEdge('ca', 'C', 'A', RelationType.INHERITANCE),
      ],
    );
    const w = (await engine.applyLayout(d, metaWith())).edgeRoutes.get('ca')!.waypoints;
    expect(w.length).toBeGreaterThan(0);
    expect(w[0].y).toBeGreaterThan(w[w.length - 1].y); // C(아래)에서 A(위)로 올라가는 순서
  });

  it('손으로 고친 간선 경로는 그대로다', async () => {
    const route: EdgeRoute = { waypoints: [{ x: 1, y: 2 }], isManual: true };
    const r = await engine.applyLayout(diagram(), metaWith({}, { e1: route }));
    expect(r.edgeRoutes.get('e1')).toEqual(route);
  });

  it('노드 30개를 처음 호출(콜드)에서도 1초 안에 배치한다', async () => {
    const nodes = Array.from({ length: 30 }, (_, i) => new ClassNode(`N${i}`, `Class${i}`, ['a: int', 'b: string'], ['run()', 'stop()']));
    const edges = Array.from({ length: 29 }, (_, i) => new RelationEdge(`E${i}`, `N${i + 1}`, `N${Math.floor(i / 2)}`, RelationType.ASSOCIATION));
    const t = performance.now();
    const r = await new LayeredLayoutEngine().applyLayout(new AbstractDiagram(DiagramType.CLASS, nodes, edges), metaWith());
    const ms = performance.now() - t;
    console.log(`30 nodes: ${ms.toFixed(0)}ms`);
    expect(r.nodePositions.size).toBe(30);
    expect(ms).toBeLessThan(1000);
  });
});