// 담당: M2 레이아웃 엔진
// 시퀀스 다이어그램용. 참여자는 order 순으로 가로, 메시지는 order 순으로 세로로 놓는다.
//
// 경로 약속(M5와 합의 필요): 메시지의 waypoints는 끝점을 뺀 꺾임점이 아니라 "전체 경로"다.
//   일반 메시지: [출발 생명선 위의 점, 도착 생명선 위의 점] (같은 y)
//   자기 메시지: 생명선에서 오른쪽으로 나왔다 돌아오는 네 점
// 시퀀스에는 노드 테두리 끝점이 없어서 y 좌표를 실어 보낼 곳이 waypoints뿐이기 때문이다.
import type { EdgeRoute, NodePosition } from '../metadata/geometry';
import type { LayoutMetadata } from '../metadata/LayoutMetadata';
import type { AbstractDiagram } from '../model/diagram';
import { MessageEdge } from '../model/edges';
import { ParticipantNode } from '../model/nodes';
import type { LayoutEngine } from './LayoutEngine';
import type { LayoutResult } from './LayoutResult';
import { measureNode } from './nodeSize';

const MARGIN_X = 40;
const BOX_TOP = 40;
const PARTICIPANT_GAP = 60;
const FIRST_MESSAGE_OFFSET = 40; // 참여자 박스 아래에서 첫 메시지까지
const MESSAGE_STEP = 50;
const SELF_LOOP_W = 40;
const SELF_LOOP_H = 20;

export class SequenceLayoutEngine implements LayoutEngine {
  async applyLayout(diagram: AbstractDiagram, metadata: LayoutMetadata): Promise<LayoutResult> {
    const nodePositions = new Map<string, NodePosition>();
    const edgeRoutes = new Map<string, EdgeRoute>();

    // 참여자: order 순서대로 왼쪽부터. 참여자가 아닌 노드는 뒤로 보낸다.
    const ordered = diagram.nodes
      .map((node, index) => ({ node, key: node instanceof ParticipantNode ? node.order : Number.MAX_SAFE_INTEGER, index }))
      .sort((a, b) => a.key - b.key || a.index - b.index);

    let cursorX = MARGIN_X;
    let tallest = 0;
    for (const { node } of ordered) {
      const size = measureNode(node);
      const saved = metadata.getPosition(node.id);
      // 고정 노드는 x, y를 그대로 두고, 크기만 현재 내용에 맞춘다.
      nodePositions.set(
        node.id,
        saved?.isPinned
          ? { x: saved.x, y: saved.y, ...size, isPinned: true }
          : { x: cursorX, y: BOX_TOP, ...size, isPinned: false },
      );
      cursorX += size.width + PARTICIPANT_GAP; // 고정 여부와 상관없이 자리는 차지한다
      tallest = Math.max(tallest, size.height);
    }

    // 메시지: order가 클수록 아래. 기본 경로는 [출발 생명선, 도착 생명선]을 같은 y로 잇는 선이다.
    const firstY = BOX_TOP + tallest + FIRST_MESSAGE_OFFSET;
    for (const edge of diagram.edges) {
      const manual = metadata.getEdgeRoute(edge.id);
      if (manual?.isManual) {
        edgeRoutes.set(edge.id, manual);
        continue;
      }
      if (!(edge instanceof MessageEdge)) continue;
      const from = nodePositions.get(edge.sourceId);
      const to = nodePositions.get(edge.targetId);
      if (!from || !to) continue;

      const y = firstY + edge.order * MESSAGE_STEP;
      const fromX = from.x + from.width / 2;
      const toX = to.x + to.width / 2;
      const waypoints =
        edge.sourceId === edge.targetId
          ? [
              { x: fromX, y },
              { x: fromX + SELF_LOOP_W, y },
              { x: fromX + SELF_LOOP_W, y: y + SELF_LOOP_H },
              { x: fromX, y: y + SELF_LOOP_H },
            ]
          : [
              { x: fromX, y },
              { x: toX, y },
            ];
      edgeRoutes.set(edge.id, { waypoints, isManual: false });
    }

    return { nodePositions, edgeRoutes };
  }
}