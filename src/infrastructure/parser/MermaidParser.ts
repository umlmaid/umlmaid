// 담당: M1 파서·모델
// Mermaid 표준 문법(classDiagram, sequenceDiagram)만 읽는다. 문법을 추가하지 않는다.
// "%% @umlmaid-layout" 줄은 주석이므로 무시한다(좌표는 FileManager가 따로 읽는다).
import { parseClassDiagram } from './ClassDiagramParser';
import { errorAt, toSourceLines } from './lines';
import type { ParseResult } from './ParseResult';

export class MermaidParser {
  parse(text: string): ParseResult {
    const lines = toSourceLines(text);
    const [header, ...rest] = lines;

    if (!header) {
      return { errors: [{ line: 1, column: 1, message: '다이어그램 종류(classDiagram 또는 sequenceDiagram)를 첫 줄에 적어 주세요' }] };
    }

    if (/^classDiagram(-v2)?$/.test(header.text)) return parseClassDiagram(rest);
    if (header.text === 'sequenceDiagram') {
      return { errors: [errorAt(header, '시퀀스 다이어그램은 아직 지원하지 않습니다 (M1 작업 중)')] };
    }
    return { errors: [errorAt(header, `지원하지 않는 다이어그램 종류입니다: ${header.text}`)] };
  }
}
