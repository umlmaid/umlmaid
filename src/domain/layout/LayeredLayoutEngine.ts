// 담당: M2 레이아웃 엔진
// 클래스 다이어그램용. elkjs의 layered 알고리즘을 쓴다.
import { todo } from '../../todo';
import type { LayoutMetadata } from '../metadata/LayoutMetadata';
import type { AbstractDiagram } from '../model/diagram';
import type { LayoutEngine } from './LayoutEngine';
import type { LayoutResult } from './LayoutResult';

export class LayeredLayoutEngine implements LayoutEngine {
  async applyLayout(diagram: AbstractDiagram, metadata: LayoutMetadata): Promise<LayoutResult> {
    return todo('M2');
  }
}
