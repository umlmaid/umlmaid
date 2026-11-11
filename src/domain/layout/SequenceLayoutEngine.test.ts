// 담당: M2 레이아웃 엔진
// LayoutMetadata(M3)가 아직 todo라서, 테스트에서는 읽기 메서드만 가짜로 바꿔 쓴다.
import { describe, expect, it } from 'vitest';
import type { EdgeRoute, NodePosition } from '../metadata/geometry';
import { LayoutMetadata } from '../metadata/LayoutMetadata';
import { AbstractDiagram } from '../model/diagram';
import { MessageEdge } from '../model/edges';
import { ParticipantNode } from '../model/nodes';
import { DiagramType } from '../model/types';
import { SequenceLayoutEngine } from './SequenceLayoutEngine';

function metaWith(pins: Record<string, NodePosition> = {}, routes: Record<string, EdgeRoute> = {}): LayoutMetadata {
  const md = new LayoutMetadata();
  md.getPosition = (id) => pins[id];
  md.getEdgeRoute = (id) => routes[id];
  return md;
}

describe('SequenceLayoutEngine', () => {
  const engine = new SequenceLayoutEngine();
  const diagram = () =>
    new AbstractDiagram(
      DiagramType.SEQUENCE,
      [new ParticipantNode('B', 'Server', 1), new ParticipantNode('A', 'Client', 0)], // 일부러 순서 뒤섞음
      [new MessageEdge('m1', 'A', 'B', 0), new MessageEdge('m2', 'B', 'B', 1), new MessageEdge('m3', 'B', 'A', 2, true)],
    );

  it('참여자는 order 순으로 왼쪽부터 놓인다', async () => {
    const r = await engine.applyLayout(diagram(), metaWith());
    expect(r.nodePositions.get('A')!.x).toBeLessThan(r.nodePositions.get('B')!.x);
  });

  it('메시지는 order가 클수록 아래다', async () => {
    const r = await engine.applyLayout(diagram(), metaWith());
    const y = (id: string) => r.edgeRoutes.get(id)!.waypoints[0].y;
    expect(y('m1')).toBeLessThan(y('m2'));
    expect(y('m2')).toBeLessThan(y('m3'));
  });

  it('고정 참여자와 손 경로는 그대로다', async () => {
    const pin: NodePosition = { x: 300, y: 10, width: 1, height: 1, isPinned: true };
    const route: EdgeRoute = { waypoints: [{ x: 9, y: 9 }], isManual: true };
    const r = await engine.applyLayout(diagram(), metaWith({ A: pin }, { m1: route }));
    expect(r.nodePositions.get('A')).toMatchObject({ x: 300, y: 10 });
    expect(r.edgeRoutes.get('m1')).toEqual(route);
  });
});