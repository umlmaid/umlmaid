// 담당: M2 레이아웃 엔진
// «Factory» 다이어그램 종류에 맞는 엔진을 고른다.
import { DiagramType } from '../model/types';
import { LayeredLayoutEngine } from './LayeredLayoutEngine';
import type { LayoutEngine } from './LayoutEngine';
import { SequenceLayoutEngine } from './SequenceLayoutEngine';

export class LayoutEngineFactory {
  forType(type: DiagramType): LayoutEngine {
    switch (type) {
      case DiagramType.CLASS:
        return new LayeredLayoutEngine();
      case DiagramType.SEQUENCE:
        return new SequenceLayoutEngine();
    }
  }
}
