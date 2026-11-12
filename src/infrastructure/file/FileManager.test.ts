// 담당: M6 저장·버전·내보내기
import { describe, expect, it } from 'vitest';
import { LayoutMetadata } from '../../domain/metadata/LayoutMetadata';
import { FileManager, LAYOUT_MARKER } from './FileManager';

const fm = new FileManager();
const META = '{"positions":{"A":{"x":10,"y":20,"width":120,"height":60,"isPinned":true}},"edgeRoutes":{}}';
const CODE = 'classDiagram\n  Animal <|-- Dog';

describe('FileManager.serialize', () => {
  it('좌표가 있으면 코드 뒤에 마커 줄을 붙인다', () => {
    expect(fm.serialize({ code: CODE, metadata: META })).toBe(`${CODE}\n${LAYOUT_MARKER}${META}`);
  });

  it('좌표가 없으면 코드만 그대로 낸다', () => {
    expect(fm.serialize({ code: CODE, metadata: '' })).toBe(CODE);
  });
});

describe('FileManager.deserialize', () => {
  it('마커 줄을 떼어 코드와 좌표로 나눈다', () => {
    expect(fm.deserialize(`${CODE}\n${LAYOUT_MARKER}${META}`)).toEqual({ code: CODE, metadata: META });
  });

  it('마커가 없으면 전체가 코드다', () => {
    expect(fm.deserialize(CODE)).toEqual({ code: CODE, metadata: '' });
  });

  it('serialize → deserialize는 코드 끝 줄바꿈까지 똑같이 돌아온다', () => {
    for (const code of [CODE, `${CODE}\n`, '', '한글 클래스\n\n']) {
      expect(fm.deserialize(fm.serialize({ code, metadata: META }))).toEqual({ code, metadata: META });
    }
  });

  it('마커 뒤에 빈 줄이 더 있어도 읽는다', () => {
    expect(fm.deserialize(`${CODE}\n${LAYOUT_MARKER}${META}\n\n`)).toEqual({ code: CODE, metadata: META });
  });

  it('윈도우 줄바꿈(CRLF) 파일도 읽는다', () => {
    const content = `classDiagram\r\n  A --> B\r\n${LAYOUT_MARKER}${META}\r\n`;
    expect(fm.deserialize(content)).toEqual({ code: 'classDiagram\r\n  A --> B', metadata: META });
  });

  it('마커가 맨 끝 줄이 아니면 좌표로 읽지 않는다', () => {
    const content = `${LAYOUT_MARKER}${META}\nclassDiagram`;
    expect(fm.deserialize(content)).toEqual({ code: content, metadata: '' });
  });

  it('좌표 JSON이 깨져 있으면 좌표만 버리고 코드는 연다', () => {
    expect(fm.deserialize(`${CODE}\n${LAYOUT_MARKER}{깨짐`)).toEqual({ code: CODE, metadata: '' });
  });

  it('마커만 있고 좌표가 비어 있어도 코드는 연다', () => {
    expect(fm.deserialize(`${CODE}\n${LAYOUT_MARKER}`)).toEqual({ code: CODE, metadata: '' });
  });
});

describe('실제 LayoutMetadata와 함께 (M3)', () => {
  it('toJson 결과를 저장했다가 읽으면 fromJson으로 같은 좌표가 복원된다', () => {
    const md = new LayoutMetadata();
    md.setPosition('A', { x: 10, y: 20, width: 120, height: 60, isPinned: true });
    md.setEdgeRoute('e1', { waypoints: [{ x: 1, y: 2 }], isManual: true });
    const file = fm.serialize({ code: CODE, metadata: md.toJson() });
    const back = fm.deserialize(file);
    expect(back.code).toBe(CODE);
    expect(LayoutMetadata.fromJson(back.metadata).getPosition('A')).toEqual({ x: 10, y: 20, width: 120, height: 60, isPinned: true });
    expect(LayoutMetadata.fromJson(back.metadata).getEdgeRoute('e1')?.isManual).toBe(true);
  });

  it('JSON 문법은 맞지만 구조가 틀린 좌표는 버리고 코드는 연다', () => {
    for (const bad of ['{}', '{"positions":[],"edgeRoutes":{}}', '{"positions":{"A":{"x":1}},"edgeRoutes":{}}', '[1,2]', '123']) {
      expect(fm.deserialize(`${CODE}\n${LAYOUT_MARKER}${bad}`)).toEqual({ code: CODE, metadata: '' });
    }
  });
});

describe('FileManager.save / load', () => {
  it('save한 Blob을 File로 load하면 같은 데이터가 나온다 (한글 포함)', async () => {
    const code = 'classDiagram\n  동물 <|-- 강아지';
    const blob = fm.save(code, META);
    const file = new File([blob], 'diagram.mmd');
    expect(await fm.load(file)).toEqual({ code, metadata: META });
  });
});
