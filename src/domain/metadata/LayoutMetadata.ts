// 담당: M3 좌표 메타데이터
// "어디에 있나" 정보. 마우스 조작은 이 객체만 바꾸고 Mermaid 코드는 바꾸지 않는다.
//
// 저장 형식(결정됨): Mermaid 파일 맨 끝에 %% 주석 한 줄로 붙인다.
//   %% @umlmaid-layout {"positions":{...},"edgeRoutes":{...}}
// toJson()/fromJson()은 이 줄의 JSON 부분만 다룬다. 줄을 붙이고 떼는 일은 FileManager(M6)가 한다.
import { todo } from '../../todo';
import type { EdgeRoute, NodePosition } from './geometry';

export class LayoutMetadata {
  private positions = new Map<string, NodePosition>();
  private edgeRoutes = new Map<string, EdgeRoute>();

  getPosition(nodeId: string): NodePosition | undefined {
    return this.positions.get(nodeId);
  }

  setPosition(nodeId: string, pos: NodePosition): void {
    todo('M3');
  }

  setPinned(nodeId: string, pinned: boolean): void {
    todo('M3');
  }

  getEdgeRoute(edgeId: string): EdgeRoute | undefined {
    return this.edgeRoutes.get(edgeId);
  }

  setEdgeRoute(edgeId: string, route: EdgeRoute): void {
    todo('M3');
  }

  toJson(): string {
    return todo('M3');
  }

  static fromJson(json: string): LayoutMetadata {
    return todo('M3');
  }
}
