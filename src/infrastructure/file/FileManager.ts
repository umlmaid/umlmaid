// 담당: M6 저장·버전·내보내기
// 저장 파일 = Mermaid 코드 + 맨 끝 줄 "%% @umlmaid-layout <LayoutMetadata JSON>"
import { todo } from '../../todo';

export interface DiagramData {
  /** %% @umlmaid-layout 줄을 뺀 Mermaid 코드 */
  code: string;
  /** LayoutMetadata.toJson() 형식. 좌표가 없으면 빈 문자열 */
  metadata: string;
}

export const LAYOUT_MARKER = '%% @umlmaid-layout ';

export class FileManager {
  /** 코드와 좌표를 한 파일 내용으로 합친다 */
  serialize(data: DiagramData): string {
    return todo('M6');
  }

  /** 파일 내용을 코드와 좌표로 나눈다 */
  deserialize(content: string): DiagramData {
    return todo('M6');
  }

  save(code: string, metadata: string): Blob {
    return todo('M6');
  }

  load(file: File): Promise<DiagramData> {
    return todo('M6');
  }
}
