// 담당: M6 저장·버전·내보내기
// «Memento» 코드 + 좌표를 통째로 담은 기록
export interface Snapshot {
  id: string;
  textState: string;
  /** LayoutMetadata.toJson() */
  metadataState: string;
  timestamp: Date;
}
