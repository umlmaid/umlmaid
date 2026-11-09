// 설계상의 약속을 테스트로 못 박는다. 이 테스트가 깨지면 설계서와 어긋난 것이다.
import { describe, expect, it } from 'vitest';
import { LayoutMetadata } from './metadata/LayoutMetadata';
import { AbstractDiagram } from './model/diagram';
import { ClassNode } from './model/nodes';
import { DiagramType, RelationType } from './model/types';
import { FakeLayoutEngine } from '../testing/fakes';
import { ImageFormat } from '../infrastructure/export/ImageExporter';

describe('범위 약속', () => {
  it('다이어그램 종류는 클래스·시퀀스 두 가지뿐이다 (CON-05)', () => {
    expect(Object.values(DiagramType)).toEqual(['CLASS', 'SEQUENCE']);
  });

  it('UML 관계는 6종이다 (FR-05-6)', () => {
    expect(Object.values(RelationType)).toHaveLength(6);
  });

  it('내보내기 형식은 PNG·JPEG 두 가지뿐이다 (CON-04)', () => {
    expect(Object.values(ImageFormat)).toEqual(['PNG', 'JPEG']);
  });
});

describe('가짜 레이아웃 엔진', () => {
  it('연결선 없는 노드도 위치를 받는다', async () => {
    const diagram = new AbstractDiagram(DiagramType.CLASS, [new ClassNode('A', 'A')]);
    const result = await new FakeLayoutEngine().applyLayout(diagram, new LayoutMetadata());
    expect(result.nodePositions.has('A')).toBe(true);
  });
});
