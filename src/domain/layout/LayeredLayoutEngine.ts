// 담당: M2 레이아웃 엔진
// 클래스 다이어그램용. elkjs의 layered 알고리즘을 쓴다.
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { EdgeRoute, NodePosition, Point } from '../metadata/geometry';
import type { LayoutMetadata } from '../metadata/LayoutMetadata';
import type { AbstractDiagram } from '../model/diagram';
import { type AbstractEdge, RelationEdge } from '../model/edges';
import { RelationType } from '../model/types';
import type { LayoutEngine } from './LayoutEngine';
import type { LayoutResult } from './LayoutResult';
import { measurePlacedNode } from './nodeSize';

const elk = new ELK(); // 인스턴스는 하나만 만들어 재사용한다
const GAP = 20; // 노드 사이 최소 간격(px)
const NODE = 'n:'; // 노드·간선 id가 ELK 안에서 겹치지 않게 붙이는 접두어
const EDGE = 'e:';

// 화면(M5)이 선을 노드 가운데에서 첫 꺾임점으로 잇는다고 가정해 POLYLINE을 쓴다.
// ORTHOGONAL은 ELK가 정한 끝점(노드 테두리)을 알아야 직각으로 그려지는데 EdgeRoute에는 끝점이 없다.
const EDGE_ROUTING = 'POLYLINE';

const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.edgeRouting': EDGE_ROUTING,
  'elk.spacing.nodeNode': '40',
  'elk.layered.spacing.nodeNodeBetweenLayers': '60',
  'elk.separateConnectedComponents': 'true', // 연결선 없는 노드도 배치한다
};

// 파서는 source=화살표 꼬리, target=머리(◁ ◆ ◇)로 만든다(ClassDiagramParser).
// UML에서는 부모·인터페이스·전체(머리 쪽)가 위에 오므로, 이 관계들은 ELK에 방향을 뒤집어 넘긴다.
const TARGET_ON_TOP = new Set<RelationType>([
  RelationType.INHERITANCE,
  RelationType.REALIZATION,
  RelationType.AGGREGATION,
  RelationType.COMPOSITION,
]);
const isReversed = (e: AbstractEdge): boolean => e instanceof RelationEdge && TARGET_ON_TOP.has(e.relationType);

export class LayeredLayoutEngine implements LayoutEngine {
  async applyLayout(diagram: AbstractDiagram, metadata: LayoutMetadata): Promise<LayoutResult> {
    const sizes = new Map(diagram.nodes.map((n) => [n.id, measurePlacedNode(n, metadata.getPosition(n.id))]));
    // 없는 노드를 가리키는 간선은 ELK가 에러를 내므로 뺀다
    const edges = diagram.edges.filter((e) => sizes.has(e.sourceId) && sizes.has(e.targetId));

    const graph: ElkNode = {
      id: 'root',
      layoutOptions: LAYOUT_OPTIONS,
      children: diagram.nodes.map((n) => ({ id: NODE + n.id, ...sizes.get(n.id)! })),
      edges: edges.map((e) => {
        const [from, to] = isReversed(e) ? [e.targetId, e.sourceId] : [e.sourceId, e.targetId];
        return { id: EDGE + e.id, sources: [NODE + from], targets: [NODE + to] };
      }),
    };
    const laidOut = await elk.layout(graph);

    const elkPos = new Map<string, Point>();
    for (const c of laidOut.children ?? []) elkPos.set(c.id.slice(NODE.length), { x: c.x ?? 0, y: c.y ?? 0 });

    // 1) 고정 노드는 저장된 x, y 그대로
    const nodePositions = new Map<string, NodePosition>();
    const placed: NodePosition[] = [];
    for (const n of diagram.nodes) {
      const saved = metadata.getPosition(n.id);
      if (!saved?.isPinned) continue;
      const pos = { x: saved.x, y: saved.y, ...sizes.get(n.id)!, isPinned: true };
      nodePositions.set(n.id, pos);
      placed.push(pos);
    }
    // 2) 나머지는 ELK 결과. 고정 노드나 앞서 놓인 노드와 겹치면 아래로 민다
    for (const n of diagram.nodes) {
      if (nodePositions.has(n.id)) continue;
      const base = elkPos.get(n.id) ?? { x: 0, y: 0 };
      const pos = { ...base, ...sizes.get(n.id)!, isPinned: false };
      pushDownUntilFree(pos, placed);
      nodePositions.set(n.id, pos);
      placed.push(pos);
    }

    // 간선: 손으로 고친 경로는 그대로, 끝점이 움직였으면 직선, 아니면 ELK 경로.
    // 고정 노드 때문에 ELK와 다른 자리에 놓인 노드가 있으면 선이 남의 상자를 지날 수 있어 돌아가게 한다.
    const elkEdges = new Map((laidOut.edges ?? []).map((e) => [e.id, e as ElkExtendedEdge]));
    const edgeRoutes = new Map<string, EdgeRoute>();
    const moved = (id: string) => {
      const a = nodePositions.get(id)!;
      const b = elkPos.get(id)!;
      return a.x !== b.x || a.y !== b.y;
    };
    for (const e of edges) {
      const manual = metadata.getEdgeRoute(e.id);
      if (manual?.isManual) {
        edgeRoutes.set(e.id, manual);
        continue;
      }
      const bends = moved(e.sourceId) || moved(e.targetId) ? [] : (elkEdges.get(EDGE + e.id)?.sections?.[0]?.bendPoints ?? []);
      const elkWaypoints = bends.map(({ x, y }) => ({ x, y }));
      // 뒤집어 넘긴 간선은 ELK 경로가 target→source 순서라, source→target 순서로 되돌린다
      if (isReversed(e)) elkWaypoints.reverse();
      const waypoints =
        e.sourceId === e.targetId ? elkWaypoints : routeAround(e.sourceId, e.targetId, elkWaypoints, nodePositions);
      edgeRoutes.set(e.id, { waypoints, isManual: false });
    }

    return { nodePositions, edgeRoutes };
  }
}

function overlaps(a: NodePosition, b: NodePosition): boolean {
  return a.x < b.x + b.width + GAP && b.x < a.x + a.width + GAP && a.y < b.y + b.height + GAP && b.y < a.y + a.height + GAP;
}

function pushDownUntilFree(pos: NodePosition, placed: NodePosition[]): void {
  for (let i = 0; i <= placed.length; i++) {
    const hit = placed.find((p) => overlaps(pos, p));
    if (!hit) return;
    pos.y = hit.y + hit.height + GAP;
  }
}

const DETOUR = 15; // 상자를 돌아갈 때 상자와 띄우는 거리(px)
const MAX_DETOURS = 40;

const center = (p: NodePosition): Point => ({ x: p.x + p.width / 2, y: p.y + p.height / 2 });

/**
 * 선(source 가운데 → 꺾임점 → target 가운데)이 양 끝이 아닌 상자를 지나가면, 그 상자 옆으로 돌아가는 꺾임점을 넣는다.
 * 돌린 뒤 새로 생긴 선분이 또 다른 상자를 지나면 다시 돌린다.
 */
function routeAround(sourceId: string, targetId: string, bends: Point[], nodes: Map<string, NodePosition>): Point[] {
  const obstacles = [...nodes].filter(([id]) => id !== sourceId && id !== targetId).map(([, p]) => p);
  const points = [center(nodes.get(sourceId)!), ...bends, center(nodes.get(targetId)!)];
  for (let n = 0; n < MAX_DETOURS; n++) {
    const hit = firstCrossing(points, obstacles);
    if (!hit) break;
    points.splice(hit.index + 1, 0, ...detour(points[hit.index], points[hit.index + 1], hit.box, obstacles));
  }
  return points.slice(1, -1);
}

function firstCrossing(points: Point[], boxes: NodePosition[]): { index: number; box: NodePosition } | undefined {
  for (let i = 0; i < points.length - 1; i++) {
    let best: { t: number; box: NodePosition } | undefined;
    for (const box of boxes) {
      const t = entersBox(points[i], points[i + 1], box);
      if (t !== undefined && (!best || t < best.t)) best = { t, box };
    }
    if (best) return { index: i, box: best.box };
  }
  return undefined;
}

/** 선분 a→b가 상자 안쪽을 지나면 들어가는 지점의 비율 t(0~1), 아니면 undefined (Liang–Barsky) */
function entersBox(a: Point, b: Point, box: NodePosition): number | undefined {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - box.x],
    [dx, box.x + box.width - a.x],
    [-dy, a.y - box.y],
    [dy, box.y + box.height - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q <= 0) return undefined;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
  }
  return t1 - t0 > 1e-6 ? t0 : undefined;
}

/**
 * 상자 옆으로 돌아가는 꺾임점 2개. 상자의 왼쪽·오른쪽·위·아래로 돌아가는 길을 모두 만들어 보고,
 * 다른 상자를 덜 지나고 덜 돌아가는 길을 고른다.
 */
function detour(a: Point, b: Point, box: NodePosition, obstacles: NodePosition[]): Point[] {
  const left = Math.max(0, box.x - DETOUR);
  const right = box.x + box.width + DETOUR;
  const top = Math.max(0, box.y - DETOUR);
  const bottom = box.y + box.height + DETOUR;
  const down = b.y > a.y;
  const toRight = b.x > a.x;
  const candidates: Point[][] = [
    // 세로로 지나가던 선: 왼쪽 또는 오른쪽으로 돌기
    [{ x: left, y: down ? top : bottom }, { x: left, y: down ? bottom : top }],
    [{ x: right, y: down ? top : bottom }, { x: right, y: down ? bottom : top }],
    // 가로로 지나가던 선: 위 또는 아래로 돌기
    [{ x: toRight ? left : right, y: top }, { x: toRight ? right : left, y: top }],
    [{ x: toRight ? left : right, y: bottom }, { x: toRight ? right : left, y: bottom }],
  ];
  const others = obstacles.filter((o) => o !== box);
  const cost = (c: Point[]) => {
    const path = [a, ...c, b];
    let crossings = 0;
    let length = 0;
    for (let i = 0; i < path.length - 1; i++) {
      length += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
      // 돌아간 길이 원래 상자를 다시 지나면 쓸 수 없다
      if (entersBox(path[i], path[i + 1], box) !== undefined) crossings += 100;
      crossings += others.filter((o) => entersBox(path[i], path[i + 1], o) !== undefined).length;
    }
    return crossings * 10_000 + length;
  };
  return candidates.reduce((best, c) => (cost(c) < cost(best) ? c : best));
}
