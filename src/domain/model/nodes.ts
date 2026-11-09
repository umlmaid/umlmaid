// 담당: M1 파서·모델
// 노드는 "무엇이 있나"만 담는다. 좌표는 여기에 두지 않는다(LayoutMetadata, M3).

export abstract class AbstractNode {
  constructor(
    readonly id: string,
    readonly label: string,
  ) {}
}

export class ClassNode extends AbstractNode {
  constructor(
    id: string,
    label: string,
    readonly attributes: string[] = [],
    readonly methods: string[] = [],
  ) {
    super(id, label);
  }
}

export class ParticipantNode extends AbstractNode {
  constructor(
    id: string,
    label: string,
    /** 왼쪽부터의 순서(0부터) */
    readonly order: number,
  ) {
    super(id, label);
  }
}
