// 담당: M2 레이아웃 엔진
// 시퀀스 다이어그램용. 참여자는 order 순으로 가로, 메시지는 order 순으로 세로로 놓는다.
import { todo } from '../../todo';
import type { LayoutMetadata } from '../metadata/LayoutMetadata';
import type { AbstractDiagram } from '../model/diagram';
import type { LayoutEngine } from './LayoutEngine';
import type { LayoutResult } from './LayoutResult';

export class SequenceLayoutEngine implements LayoutEngine {
  async applyLayout(diagram: AbstractDiagram, metadata: LayoutMetadata): Promise<LayoutResult> {
    return todo('M2');
  }
}
