// 담당: M5 화면 — 관계 레이블이 다중성 글자와 겹치지 않을 자리를 고른다. 화면 표시용 계산만 한다.
import type { Point } from '../domain/metadata/geometry';

/** 글자 한 줄이 차지하는 대략의 상자. y는 글자 기준선(baseline)이다. */
export interface TextBox {
  x: number;
  y: number;
  width: number;
}

/** 12px 글꼴 기준: 기준선 위로 12px, 아래로 3px */
const ASCENT = 12;
const DESCENT = 3;
/** 겹침 판정 여유 */
const GAP = 2;
/** 레이블을 선에서 옆으로 한 번에 미는 거리 */
const STEP = 8;
const MAX_STEPS = 8;
/** 지금까지처럼 기준선을 선보다 6px 위에 둔다 */
const BASELINE_LIFT = 6;

export function textBoxesOverlap(a: TextBox, b: TextBox): boolean {
  return (
    a.x - a.width / 2 - GAP < b.x + b.width / 2 &&
    b.x - b.width / 2 - GAP < a.x + a.width / 2 &&
    a.y - ASCENT - GAP < b.y + DESCENT &&
    b.y - ASCENT - GAP < a.y + DESCENT
  );
}

/**
 * 레이블 기준선 위치를 정한다.
 * 겹치는 글자가 없으면 지금까지와 같은 자리(선 중간점에서 6px 위)를 돌려준다.
 * 겹치면 선에 수직인 방향으로 양쪽을 번갈아 조금씩 밀어 가장 가까운 빈 자리를 쓴다.
 * 끝까지 빈 자리가 없으면 원래 자리를 쓴다.
 */
export function placeLabel(anchor: Point, direction: Point, width: number, obstacles: TextBox[]): Point {
  const length = Math.hypot(direction.x, direction.y);
  const normal = length === 0 ? { x: 0, y: -1 } : { x: -direction.y / length, y: direction.x / length };
  const at = (offset: number): Point => ({
    x: Math.max(width / 2, anchor.x + normal.x * offset),
    y: anchor.y + normal.y * offset - BASELINE_LIFT,
  });
  const free = (p: Point) => !obstacles.some((o) => textBoxesOverlap({ ...p, width }, o));

  const original = at(0);
  if (free(original)) return original;
  for (let step = 1; step <= MAX_STEPS; step += 1) {
    for (const sign of [1, -1]) {
      const candidate = at(sign * step * STEP);
      if (free(candidate)) return candidate;
    }
  }
  return original;
}
