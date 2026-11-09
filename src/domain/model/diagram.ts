// 담당: M1 파서·모델
import { AbstractEdge } from './edges';
import { AbstractNode } from './nodes';
import { DiagramType } from './types';

/**
 * 코드에서 온 "무엇이 있나" 정보.
 * 연결선이 없는 노드도 nodes에 반드시 들어가야 한다(고립 노드도 그린다).
 */
export class AbstractDiagram {
  constructor(
    readonly type: DiagramType,
    readonly nodes: AbstractNode[] = [],
    readonly edges: AbstractEdge[] = [],
  ) {}

  getNode(id: string): AbstractNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }
}
