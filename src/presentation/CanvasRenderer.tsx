// 담당: M5 화면
// 그리기만 한다. 드래그 등 마우스 입력은 DragController(M3)로 넘기고 데이터를 직접 바꾸지 않는다.
// 노드 글자는 100% 배율에서 12px 이상이어야 한다(NFR-07).
//
// 지금은 M4가 흐름 확인용으로 넣은 임시 그리기다(상자 + 이름 + 직선).
// UML 표준 표기(관계 6종 화살표, 스테레오타입, 시퀀스)는 M5가 만든다(FR-05-6, FR-05-7).
import type { LayoutResult } from '../domain/layout/LayoutResult';
import type { AbstractDiagram } from '../domain/model/diagram';
import { ClassNode } from '../domain/model/nodes';

export const MIN_FONT_SIZE = 12;
const PADDING = 20;

interface Props {
  diagram?: AbstractDiagram;
  layout?: LayoutResult;
}

export function CanvasRenderer({ diagram, layout }: Props) {
  if (!diagram || !layout) {
    return <svg width="100%" height="100%" />;
  }
  const positions = [...layout.nodePositions.values()];
  const width = Math.max(0, ...positions.map((p) => p.x + p.width)) + PADDING * 2;
  const height = Math.max(0, ...positions.map((p) => p.y + p.height)) + PADDING * 2;

  return (
    <svg width={width} height={height} style={{ background: 'white' }} fontSize={MIN_FONT_SIZE} fontFamily="sans-serif">
      <g transform={`translate(${PADDING},${PADDING})`}>
        {diagram.edges.map((edge) => {
          const s = layout.nodePositions.get(edge.sourceId);
          const t = layout.nodePositions.get(edge.targetId);
          if (!s || !t) return null;
          return (
            <line
              key={edge.id}
              x1={s.x + s.width / 2}
              y1={s.y + s.height / 2}
              x2={t.x + t.width / 2}
              y2={t.y + t.height / 2}
              stroke="black"
            />
          );
        })}
        {diagram.nodes.map((node) => {
          const p = layout.nodePositions.get(node.id);
          if (!p) return null;
          const members = node instanceof ClassNode ? [...node.attributes, ...node.methods] : [];
          return (
            <g key={node.id} transform={`translate(${p.x},${p.y})`}>
              <rect width={p.width} height={p.height} fill="white" stroke="black" />
              <text x={p.width / 2} y={18} textAnchor="middle" fontWeight="bold">
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
