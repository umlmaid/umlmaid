// 담당: M1 파서·모델
// 지원 범위는 클래스·시퀀스 다이어그램뿐이다(명세서 CON-05). 종류를 추가하지 않는다.

export enum DiagramType {
  CLASS = 'CLASS',
  SEQUENCE = 'SEQUENCE',
}

/** UML 관계 6종(명세서 FR-05-6) */
export enum RelationType {
  ASSOCIATION = 'ASSOCIATION',
  INHERITANCE = 'INHERITANCE',
  REALIZATION = 'REALIZATION',
  DEPENDENCY = 'DEPENDENCY',
  AGGREGATION = 'AGGREGATION',
  COMPOSITION = 'COMPOSITION',
}
