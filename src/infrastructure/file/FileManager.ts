// 담당: M6 저장·버전·내보내기
// 저장 파일 = Mermaid 코드 + 맨 끝 줄 "%% @umlmaid-layout <LayoutMetadata JSON>"
import { LayoutMetadata } from '../../domain/metadata/LayoutMetadata';

export interface DiagramData {
  /** %% @umlmaid-layout 줄을 뺀 Mermaid 코드 */
  code: string;
  /** LayoutMetadata.toJson() 형식. 좌표가 없으면 빈 문자열 */
  metadata: string;
}

export const LAYOUT_MARKER = '%% @umlmaid-layout ';

export class FileManager {
  /**
   * 코드와 좌표를 한 파일 내용으로 합친다.
   * 좌표가 있으면 코드 뒤에 줄바꿈 하나를 두고 마커 줄을 붙인다. deserialize가 이 줄바꿈 하나를 되돌려 준다.
   */
  serialize(data: DiagramData): string {
    if (data.metadata === '') return data.code;
    return `${data.code}\n${LAYOUT_MARKER}${data.metadata}`;
  }

  /**
   * 파일 내용을 코드와 좌표로 나눈다.
   * 마커는 맨 끝의 비어 있지 않은 줄에 있을 때만 좌표로 읽는다.
   * 좌표 JSON이 깨졌거나 구조가 틀려도(LayoutMetadata.fromJson이 거부) 코드는 열 수 있게, 그 경우 좌표만 버린다.
   * 이렇게 하지 않으면 SyncManager.load가 fromJson에서 던져 파일 전체가 안 열린다.
   */
  deserialize(content: string): DiagramData {
    const marker = LAYOUT_MARKER.trimEnd();
    const body = content.replace(/\s+$/, '');
    const lineStart = body.lastIndexOf('\n') + 1;
    const lastLine = body.slice(lineStart);
    if (!lastLine.startsWith(marker)) return { code: content, metadata: '' };

    const json = lastLine.slice(marker.length).trim();
    const code = lineStart === 0 ? '' : body.slice(0, lineStart - 1).replace(/\r$/, '');
    return { code, metadata: isValidJson(json) ? json : '' };
  }

  save(code: string, metadata: string): Blob {
    return new Blob([this.serialize({ code, metadata })], { type: 'text/plain;charset=utf-8' });
  }

  async load(file: File): Promise<DiagramData> {
    return this.deserialize(await file.text());
  }
}

function isValidJson(text: string): boolean {
  if (text === '') return false;
  try {
    LayoutMetadata.fromJson(text);
    return true;
  } catch {
    return false;
  }
}
