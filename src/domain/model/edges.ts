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

export interface RelationEdgeOptions {
  /** source 끝에 붙는 다중성. 예: '1', '0..*'. 없으면 '' */
  sourceMultiplicity?: string;
  /** target 끝에 붙는 다중성 */
  targetMultiplicity?: string;
  label?: string;
}

export class RelationEdge extends AbstractEdge {
  /**
   * UML은 다중성을 관계의 양 끝에 따로 쓴다(인터뷰 Q5 UML 표준, 인터뷰 추가 "논문용이니 표준에 맞춘다").
   * 예: `A "1" --> "*" B` → sourceMultiplicity '1', targetMultiplicity '*'
   */
  readonly sourceMultiplicity: string;
  readonly targetMultiplicity: string;

  constructor(
    id: string,
    sourceId: string,
    targetId: string,
    readonly relationType: RelationType,
    options: RelationEdgeOptions = {},
  ) {
    super(id, sourceId, targetId, options.label ?? '');
    this.sourceMultiplicity = options.sourceMultiplicity ?? '';
    this.targetMultiplicity = options.targetMultiplicity ?? '';
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
