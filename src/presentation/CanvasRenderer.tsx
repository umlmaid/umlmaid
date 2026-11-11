// 담당: M5 화면
// 그리기만 한다. 드래그 등 마우스 입력은 DragController(M3)로 넘기고 데이터를 직접 바꾸지 않는다.
// 노드 글자는 100% 배율에서 12px 이상이어야 한다(NFR-07).
//
// 지금은 M4가 흐름 확인용으로 넣은 임시 그리기다(상자 + 이름 + 꺾은선, 시퀀스는 생명선 + 메시지).
// UML 표준 표기(관계 6종 화살표, 스테레오타입, 시퀀스 표기)는 M5가 만든다(FR-05-6, FR-05-7).
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { Point } from '../domain/metadata/geometry';
import type { AbstractDiagram } from '../domain/model/diagram';
import { MessageEdge } from '../domain/model/edges';
import { ClassNode } from '../domain/model/nodes';
import { DiagramType } from '../domain/model/types';

export const MIN_FONT_SIZE = 12;
const PADDING = 20;
const LABEL_ROOM = 80; // 오른쪽 끝 메시지 이름이 잘리지 않게 남기는 폭
const LIFELINE_TAIL = 40; // 마지막 메시지 아래로 생명선을 더 그리는 길이

interface Props {
  diagram?: AbstractDiagram;
  layout?: LayoutResult;
}

const toPoints = (points: Point[]) => points.map((p) => `${p.x},${p.y}`).join(' ');

export function CanvasRenderer({ diagram, layout }: Props) {
  if (!diagram || !layout) {
    return <svg width="100%" height="100%" />;
  }
  const isSequence = diagram.type === DiagramType.SEQUENCE;
  const positions = [...layout.nodePositions.values()];
  const routePoints = [...layout.edgeRoutes.values()].flatMap((r) => r.waypoints);
  const bottom = Math.max(0, ...positions.map((p) => p.y + p.height), ...routePoints.map((p) => p.y));
  const lifelineEnd = bottom + LIFELINE_TAIL;
  const width = Math.max(0, ...positions.map((p) => p.x + p.width), ...routePoints.map((p) => p.x)) + PADDING * 2 + LABEL_ROOM;
  const height = (isSequence ? lifelineEnd : bottom) + PADDING * 2;

  return (
    <svg width={width} height={height} style={{ background: 'white' }} fontSize={MIN_FONT_SIZE} fontFamily="sans-serif">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10" fill="none" stroke="black" />
        </marker>
      </defs>
      <g transform={`translate(${PADDING},${PADDING})`}>
        {isSequence &&
          positions.map((p, i) => (
            <line key={i} x1={p.x + p.width / 2} y1={p.y + p.height} x2={p.x + p.width / 2} y2={lifelineEnd} stroke="gray" strokeDasharray="4 4" />
          ))}
        {diagram.edges.map((edge) => {
          const s = layout.nodePositions.get(edge.sourceId);
          const t = layout.nodePositions.get(edge.targetId);
          const waypoints = layout.edgeRoutes.get(edge.id)?.waypoints ?? [];
          if (!s || !t) return null;
          // 시퀀스 메시지의 waypoints는 전체 경로, 클래스 간선은 노드 가운데 사이의 꺾임점이다(M2 약속)
          const points = isSequence
            ? waypoints
            : [{ x: s.x + s.width / 2, y: s.y + s.height / 2 }, ...waypoints, { x: t.x + t.width / 2, y: t.y + t.height / 2 }];
          if (points.length < 2) return null;
          const reply = edge instanceof MessageEdge && edge.isReply;
          const mid = points[Math.floor((points.length - 1) / 2)];
          return (
            <g key={edge.id}>
              <polyline
                points={toPoints(points)}
                fill="none"
                stroke="black"
                strokeDasharray={reply ? '6 4' : undefined}
                markerEnd={isSequence ? 'url(#arrow)' : undefined}
              />
              {edge.label && (
                <text x={mid.x + 4} y={mid.y - 4}>
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}
        {diagram.nodes.map((node) => {
          const p = layout.nodePositions.get(node.id);
          if (!p) return null;
          const members = node instanceof ClassNode ? [...node.attributes, ...node.methods] : [];
          return (
            <g key={node.id} transform={`translate(${p.x},${p.y})`}>
              <rect width={p.width} height={p.height} fill="white" stroke="black" />
              <text x={p.width / 2} y={isSequence ? p.height / 2 + 4 : 18} textAnchor="middle" fontWeight="bold">
                {node.label}
              </text>
              {members.map((m, i) => (
                <text key={i} x={6} y={38 + i * 16}>
                  {m}
                </text>
              ))}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
