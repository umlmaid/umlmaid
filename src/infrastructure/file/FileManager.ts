// 담당: M6 저장·버전·내보내기
// 저장 파일 = Mermaid 코드
//           + (저장한 버전이 있으면) "%% @umlmaid-versions <SavedVersions JSON>"
//           + 맨 끝 줄 "%% @umlmaid-layout <LayoutMetadata JSON>"
// 두 줄 모두 Mermaid 주석이라 다른 Mermaid 도구에서도 그대로 열린다(인터뷰 Q9).
import { LayoutMetadata } from '../../domain/metadata/LayoutMetadata';

export interface DiagramData {
  /** %% @umlmaid-layout 줄을 뺀 Mermaid 코드 */
  code: string;
  /** LayoutMetadata.toJson() 형식. 좌표가 없으면 빈 문자열 */
  metadata: string;
  /** SavedVersions.toJson() 형식. 저장한 버전이 없으면 빈 문자열(없어도 된다) */
  versions?: string;
}

export const LAYOUT_MARKER = '%% @umlmaid-layout ';
export const VERSIONS_MARKER = '%% @umlmaid-versions ';

export class FileManager {
  /**
   * 코드와 좌표를 한 파일 내용으로 합친다.
   * 좌표가 있으면 코드 뒤에 줄바꿈 하나를 두고 마커 줄을 붙인다. deserialize가 이 줄바꿈 하나를 되돌려 준다.
   */
  serialize(data: DiagramData): string {
    let content = data.code;
    if (data.versions) content += `\n${VERSIONS_MARKER}${data.versions}`;
    if (data.metadata !== '') content += `\n${LAYOUT_MARKER}${data.metadata}`;
    return content;
  }

  /**
   * 파일 내용을 코드와 좌표로 나눈다.
   * 마커는 맨 끝의 비어 있지 않은 줄에 있을 때만 좌표로 읽는다.
   * 좌표 JSON이 깨졌거나 구조가 틀려도(LayoutMetadata.fromJson이 거부) 코드는 열 수 있게, 그 경우 좌표만 버린다.
   * 이렇게 하지 않으면 SyncManager.load가 fromJson에서 던져 파일 전체가 안 열린다.
   */
  deserialize(content: string): DiagramData {
    const layout = takeLastLine(content, LAYOUT_MARKER);
    const metadata = layout && isValidJson(layout.json) ? layout.json : '';
    // 버전 줄은 좌표 줄 바로 앞(좌표가 없으면 맨 끝)에 있다
    const versions = takeLastLine(layout ? layout.rest : content, VERSIONS_MARKER);
    if (!layout && !versions) return { code: content, metadata: '' };
    const code = versions ? versions.rest : layout!.rest;
    return versions ? { code, metadata, versions: isJson(versions.json) ? versions.json : '' } : { code, metadata };
  }

  save(code: string, metadata: string, versions = ''): Blob {
    return new Blob([this.serialize({ code, metadata, versions })], { type: 'text/plain;charset=utf-8' });
  }

  async load(file: File): Promise<DiagramData> {
    return this.deserialize(await file.text());
  }
}

/** 맨 끝의 비어 있지 않은 줄이 marker로 시작하면 그 JSON과 나머지 코드로 나눈다 */
function takeLastLine(content: string, marker: string): { json: string; rest: string } | undefined {
  const body = content.replace(/\s+$/, '');
  const lineStart = body.lastIndexOf('\n') + 1;
  const lastLine = body.slice(lineStart);
  if (!lastLine.startsWith(marker.trimEnd())) return undefined;
  return {
    json: lastLine.slice(marker.trimEnd().length).trim(),
    rest: lineStart === 0 ? '' : body.slice(0, lineStart - 1).replace(/\r$/, ''),
  };
}

/** 버전 JSON의 구조 검사는 SavedVersions(application)가 한다. 여기서는 계층 규칙상 JSON인지만 본다. */
function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
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
