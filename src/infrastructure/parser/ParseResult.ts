// 담당: M1 파서·모델
import type { AbstractDiagram } from '../../domain/model/diagram';

/**
 * 문법 오류 한 개. JavaScript 내장 SyntaxError와 이름이 같으므로 값(new, instanceof)으로 쓰지 말고
 * 항상 `import type`으로만 가져온다.
 */
export interface SyntaxError {
  /** 1부터 시작하는 줄 번호 */
  line: number;
  column: number;
  message: string;
}

export interface ParseResult {
  /** 성공하면 다이어그램, 실패하면 undefined */
  diagram?: AbstractDiagram;
  errors: SyntaxError[];
}

export function isSuccess(result: ParseResult): boolean {
  return result.diagram !== undefined && result.errors.length === 0;
}
