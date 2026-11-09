// 담당: M1 파서·모델
import { RelationType } from './types';

export abstract class AbstractEdge {
  constructor(
    readonly id: string,
    readonly sourceId: string,
    readonly targetId: string,
    readonly label: string = '',
  ) {}
}

export class RelationEdge extends AbstractEdge {
  constructor(
    id: string,
    sourceId: string,
    targetId: string,
    readonly relationType: RelationType,
    readonly multiplicity: string = '',
    label = '',
  ) {
    super(id, sourceId, targetId, label);
  }
}

export class MessageEdge extends AbstractEdge {
  constructor(
    id: string,
    sourceId: string,
    targetId: string,
    /** 위에서부터의 메시지 순서(0부터) */
    readonly order: number,
    readonly isReply: boolean = false,
    label = '',
  ) {
    super(id, sourceId, targetId, label);
  }
}
