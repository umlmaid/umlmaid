import { describe, expect, it } from 'vitest';
import type { EdgeRoute, NodePosition } from './geometry';
import { LayoutMetadata } from './LayoutMetadata';

const position: NodePosition = { x: 12.5, y: -30, width: 160, height: 80, isPinned: true };
const route: EdgeRoute = { waypoints: [{ x: 50, y: 200 }, { x: 75.5, y: -10 }], isManual: true };

describe('위치와 고정 상태 (FR-04-2, FR-04-4)', () => {
  it('위치·크기·고정 상태를 ID별로 저장하고 조회한다', () => {
    const metadata = new LayoutMetadata();
    metadata.setPosition('A', position);
    metadata.setPosition('B', { ...position, x: 400, isPinned: false });

    expect(metadata.getPosition('A')).toEqual(position);
    expect(metadata.getPosition('B')).toEqual({ ...position, x: 400, isPinned: false });
  });

  it('같은 ID에 저장하면 이전 위치·크기·고정 상태를 덮어쓴다', () => {
    const metadata = new LayoutMetadata();
    metadata.setPosition('A', position);
    const replacement = { x: 0, y: 0, width: 200, height: 100, isPinned: false };
    metadata.setPosition('A', replacement);

    expect(metadata.getPosition('A')).toEqual(replacement);
  });

  it('위치와 크기를 유지하면서 고정하고 해제한다', () => {
    const metadata = new LayoutMetadata();
    metadata.setPosition('A', { ...position, isPinned: false });
    metadata.setPosition('B', position);

    metadata.setPinned('A', true);
    expect(metadata.getPosition('A')).toEqual(position);
    metadata.setPinned('A', false);
    expect(metadata.getPosition('A')).toEqual({ ...position, isPinned: false });
    expect(metadata.getPosition('B')).toEqual(position);
  });

  it('누락 ID 조회는 undefined이고 고정 변경은 새 위치를 만들지 않는다', () => {
    const metadata = new LayoutMetadata();
    expect(metadata.getPosition('missing')).toBeUndefined();
    expect(metadata.getEdgeRoute('missing')).toBeUndefined();
    metadata.setPinned('missing', true);
    metadata.setPinned('missing', false);

    expect(JSON.parse(metadata.toJson())).toEqual({ positions: {}, edgeRoutes: {} });
  });

  it('저장한 뒤 입력 객체가 바뀌어도 저장된 위치는 유지한다', () => {
    const metadata = new LayoutMetadata();
    const input = { ...position };
    metadata.setPosition('A', input);
    input.x = 999;
    input.isPinned = false;

    expect(metadata.getPosition('A')).toEqual(position);
  });
});

describe('수동 간선 경로 (FR-04-7)', () => {
  it('꺾임점의 순서와 수동 여부를 간선 ID별로 저장하고 조회한다', () => {
    const metadata = new LayoutMetadata();
    metadata.setEdgeRoute('A-->B', route);
    metadata.setEdgeRoute('B-->C', { waypoints: [], isManual: false });

    expect(metadata.getEdgeRoute('A-->B')).toEqual(route);
    expect(metadata.getEdgeRoute('B-->C')).toEqual({ waypoints: [], isManual: false });
  });

  it('같은 ID의 경로를 빈 수동 경로로 덮어쓸 수 있다', () => {
    const metadata = new LayoutMetadata();
    metadata.setEdgeRoute('A-->B', route);
    metadata.setEdgeRoute('A-->B', { waypoints: [], isManual: true });

    expect(metadata.getEdgeRoute('A-->B')).toEqual({ waypoints: [], isManual: true });
  });

  it('입력 배열과 꺾임점을 나중에 수정해도 저장된 경로는 유지한다', () => {
    const metadata = new LayoutMetadata();
    const input: EdgeRoute = { waypoints: [{ x: 10, y: 20 }], isManual: true };
    metadata.setEdgeRoute('A-->B', input);
    input.waypoints[0].x = 999;
    input.waypoints.push({ x: 30, y: 40 });
    input.isManual = false;

    expect(metadata.getEdgeRoute('A-->B')).toEqual({ waypoints: [{ x: 10, y: 20 }], isManual: true });
  });
});

describe('JSON 저장과 복원 (DF-02)', () => {
  it('빈 상태는 두 빈 객체를 가진 JSON으로 저장된다', () => {
    expect(JSON.parse(new LayoutMetadata().toJson())).toEqual({ positions: {}, edgeRoutes: {} });
  });

  it.each(['', '{"positions":{},"edgeRoutes":{}}'])('빈 메타데이터를 복원한다: %j', (json) => {
    const metadata = LayoutMetadata.fromJson(json);
    expect(metadata).toBeInstanceOf(LayoutMetadata);
    expect(metadata.getPosition('A')).toBeUndefined();
    expect(metadata.getEdgeRoute('A-->B')).toBeUndefined();
    expect(JSON.parse(metadata.toJson())).toEqual({ positions: {}, edgeRoutes: {} });
  });

  it('마커 없이 positions와 edgeRoutes만 직렬화한다', () => {
    const metadata = new LayoutMetadata();
    metadata.setPosition('A', position);
    metadata.setEdgeRoute('A-->B', route);
    const json = metadata.toJson();

    expect(json).not.toContain('%% @umlmaid-layout');
    expect(JSON.parse(json)).toEqual({ positions: { A: position }, edgeRoutes: { 'A-->B': route } });
  });

  it('여러 위치·크기·고정 상태·경로를 JSON 왕복 후 독립된 상태로 복원한다', () => {
    const original = new LayoutMetadata();
    original.setPosition('A', position);
    original.setPosition('B', { ...position, x: 0, isPinned: false });
    original.setEdgeRoute('A-->B', route);
    original.setEdgeRoute('B-->A', { waypoints: [], isManual: false });
    const restored = LayoutMetadata.fromJson(original.toJson());

    expect(restored.getPosition('A')).toEqual(position);
    expect(restored.getPosition('B')).toEqual({ ...position, x: 0, isPinned: false });
    expect(restored.getEdgeRoute('A-->B')).toEqual(route);
    expect(restored.getEdgeRoute('B-->A')).toEqual({ waypoints: [], isManual: false });
    expect(JSON.parse(restored.toJson())).toEqual(JSON.parse(original.toJson()));

    restored.setPinned('A', false);
    restored.setEdgeRoute('A-->B', { waypoints: [], isManual: true });
    expect(original.getPosition('A')).toEqual(position);
    expect(original.getEdgeRoute('A-->B')).toEqual(route);
  });

  it('객체의 기본 속성과 같은 ID도 그대로 복원한다', () => {
    const metadata = new LayoutMetadata();
    metadata.setPosition('__proto__', position);
    metadata.setEdgeRoute('constructor', route);
    const restored = LayoutMetadata.fromJson(metadata.toJson());

    expect(restored.getPosition('__proto__')).toEqual(position);
    expect(restored.getEdgeRoute('constructor')).toEqual(route);
  });

  it.each(['{', 'not json', ' ', '%% @umlmaid-layout {"positions":{},"edgeRoutes":{}}'])(
    'JSON 문법 오류나 마커가 포함된 입력을 SyntaxError로 알린다: %j',
    (json) => {
      expect(() => LayoutMetadata.fromJson(json)).toThrow(SyntaxError);
    },
  );

  it.each([
    null,
    [],
    {},
    { positions: {} },
    { edgeRoutes: {} },
    { positions: [], edgeRoutes: {} },
    { positions: {}, edgeRoutes: null },
    { positions: { A: null }, edgeRoutes: {} },
    { positions: { A: { ...position, x: '12' } }, edgeRoutes: {} },
    { positions: { A: { x: 0, y: 0, isPinned: true } }, edgeRoutes: {} },
    { positions: { A: { ...position, isPinned: 1 } }, edgeRoutes: {} },
    { positions: {}, edgeRoutes: { edge: { waypoints: {}, isManual: true } } },
    { positions: {}, edgeRoutes: { edge: { waypoints: [{ x: 0 }], isManual: true } } },
    { positions: {}, edgeRoutes: { edge: { waypoints: [], isManual: 'true' } } },
  ])('필수 필드가 없거나 타입이 잘못된 데이터는 TypeError로 알린다: %j', (data) => {
    expect(() => LayoutMetadata.fromJson(JSON.stringify(data))).toThrow(TypeError);
  });

  it('숫자가 무한대로 해석되는 JSON은 TypeError로 알린다', () => {
    const json = '{"positions":{"A":{"x":1e400,"y":0,"width":160,"height":80,"isPinned":true}},"edgeRoutes":{}}';
    expect(() => LayoutMetadata.fromJson(json)).toThrow(TypeError);
  });
});
