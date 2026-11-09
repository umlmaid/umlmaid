// 담당: M1 파서·모델
import type { AbstractDiagram } from '../../domain/model/diagram';

export interface ParseError {
  /** 1부터 시작하는 줄 번호 */
  line: number;
  column: number;
  message: string;
}

export interface ParseResult {
  /** 성공하면 다이어그램, 실패하면 undefined */
  diagram?: AbstractDiagram;
  errors: ParseError[];
}

export function isSuccess(result: ParseResult): boolean {
  return result.diagram !== undefined && result.errors.length === 0;
}
