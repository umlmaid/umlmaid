// 담당: M1 파서·모델
// 파서들이 함께 쓰는 줄 단위 도구.
import type { ParseError } from './ParseResult';

export interface SourceLine {
  /** 1부터 시작하는 줄 번호 */
  line: number;
  /** 앞뒤 공백을 뺀 내용 */
  text: string;
  /** 내용이 시작하는 칸(1부터) */
  column: number;
}

/**
 * 텍스트를 줄로 나누고, 빈 줄·주석(%%)·맨 앞의 YAML 머리말(---)을 뺀다.
 * "%% @umlmaid-layout" 줄도 주석이므로 여기서 빠진다.
 */
export function toSourceLines(text: string): SourceLine[] {
  const raw = text.split(/\r?\n/);
  const result: SourceLine[] = [];
  let i = 0;

  // 맨 앞 YAML 머리말: ---\n...\n---
  const firstContent = raw.findIndex((l) => l.trim() !== '');
  if (firstContent >= 0 && raw[firstContent].trim() === '---') {
    const end = raw.findIndex((l, idx) => idx > firstContent && l.trim() === '---');
    if (end > firstContent) i = end + 1;
  }

  for (; i < raw.length; i++) {
    const text = raw[i].trim();
    if (text === '' || text.startsWith('%%')) continue;
    result.push({ line: i + 1, text, column: raw[i].length - raw[i].trimStart().length + 1 });
  }
  return result;
}

export function errorAt(src: SourceLine, message: string): ParseError {
  return { line: src.line, column: src.column, message };
}
