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
    /**
     * << >> 안의 글자. 예: 'interface', 'abstract', 'enumeration'. 없으면 ''.
     * 화면은 이름 위에 «interface»처럼 그린다(인터뷰 Q5 UML 표준, FR-05-6).
     */
    readonly stereotype: string = '',
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
