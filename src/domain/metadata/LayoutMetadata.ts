// 담당: M3 좌표 메타데이터
// "어디에 있나" 정보. 마우스 조작은 이 객체만 바꾸고 Mermaid 코드는 바꾸지 않는다.
//
// 저장 형식(결정됨): Mermaid 파일 맨 끝에 %% 주석 한 줄로 붙인다.
//   %% @umlmaid-layout {"positions":{...},"edgeRoutes":{...}}
// toJson()/fromJson()은 이 줄의 JSON 부분만 다룬다. 줄을 붙이고 떼는 일은 FileManager(M6)가 한다.
import type { EdgeRoute, NodePosition, Point } from './geometry';

export class LayoutMetadata {
  private positions = new Map<string, NodePosition>();
  private edgeRoutes = new Map<string, EdgeRoute>();

  getPosition(nodeId: string): NodePosition | undefined {
    return this.positions.get(nodeId);
  }

  setPosition(nodeId: string, pos: NodePosition): void {
    this.positions.set(nodeId, { ...pos });
  }

  /** 위치가 없는 ID는 새 좌표를 만들지 않고 무시한다. */
  setPinned(nodeId: string, pinned: boolean): void {
    const pos = this.positions.get(nodeId);
    if (pos) this.positions.set(nodeId, { ...pos, isPinned: pinned });
  }

  getEdgeRoute(edgeId: string): EdgeRoute | undefined {
    return this.edgeRoutes.get(edgeId);
  }

  setEdgeRoute(edgeId: string, route: EdgeRoute): void {
    this.edgeRoutes.set(edgeId, {
      waypoints: route.waypoints.map((point) => ({ ...point })),
      isManual: route.isManual,
    });
  }

  toJson(): string {
    return JSON.stringify({
      positions: Object.fromEntries(this.positions),
      edgeRoutes: Object.fromEntries(this.edgeRoutes),
    });
  }

  /** 빈 문자열은 빈 상태, 문법 오류는 SyntaxError, 잘못된 구조는 TypeError로 처리한다. */
  static fromJson(json: string): LayoutMetadata {
    const metadata = new LayoutMetadata();
    // MetadataFactory와 기존 메모리 구현의 빈 문자열 처리에 맞춘다.
    if (json === '') return metadata;

    const data: unknown = JSON.parse(json);
    if (!isRecord(data) || !isRecord(data.positions) || !isRecord(data.edgeRoutes)) {
      throw new TypeError('Invalid layout metadata: positions and edgeRoutes must be objects');
    }
    for (const [id, pos] of Object.entries(data.positions)) {
      if (!isNodePosition(pos)) throw new TypeError(`Invalid node position: ${id}`);
      metadata.setPosition(id, pos);
    }
    for (const [id, route] of Object.entries(data.edgeRoutes)) {
      if (!isEdgeRoute(route)) throw new TypeError(`Invalid edge route: ${id}`);
      metadata.setEdgeRoute(id, route);
    }
    return metadata;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPoint(value: unknown): value is Point {
  return isRecord(value)
    && typeof value.x === 'number' && Number.isFinite(value.x)
    && typeof value.y === 'number' && Number.isFinite(value.y);
}

function isNodePosition(value: unknown): value is NodePosition {
  return isRecord(value) && isPoint(value)
    && typeof value.width === 'number' && Number.isFinite(value.width)
    && typeof value.height === 'number' && Number.isFinite(value.height)
    && typeof value.isPinned === 'boolean';
}

function isEdgeRoute(value: unknown): value is EdgeRoute {
  return isRecord(value) && Array.isArray(value.waypoints)
    && value.waypoints.every(isPoint) && typeof value.isManual === 'boolean';
}
