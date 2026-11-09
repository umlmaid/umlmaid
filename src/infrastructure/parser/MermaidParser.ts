// 담당: M1 파서·모델
// Mermaid 표준 문법(classDiagram, sequenceDiagram)만 읽는다. 문법을 추가하지 않는다.
// "%% @umlmaid-layout" 줄은 주석이므로 무시한다(좌표는 FileManager가 따로 읽는다).
import { todo } from '../../todo';
import type { ParseResult } from './ParseResult';

export class MermaidParser {
  parse(text: string): ParseResult {
    return todo('M1');
  }
}
