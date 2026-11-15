import { describe, expect, it } from 'vitest';
import { placeLabel, textBoxesOverlap, type TextBox } from './labelPlacement';

describe('관계 레이블 자리 (다중성과 겹치지 않기)', () => {
  it('겹치는 글자가 없으면 지금까지와 같은 자리(중간점 6px 위)', () => {
    expect(placeLabel({ x: 100, y: 100 }, { x: 0, y: 50 }, 48, [])).toEqual({ x: 100, y: 94 });
  });

  it('겹치지 않는 다중성이 있어도 자리를 바꾸지 않는다', () => {
    const far: TextBox = { x: 300, y: 300, width: 8 };
    expect(placeLabel({ x: 100, y: 100 }, { x: 0, y: 50 }, 48, [far])).toEqual({ x: 100, y: 94 });
  });

  it('짧은 세로선에서 다중성과 겹치면 선 옆으로 비켜 겹치지 않는 자리를 쓴다', () => {
    // Dog(위) → Cat(아래) 짧은 연관선, 다중성 "1"이 레이블 근처에 있다
    const anchor = { x: 100, y: 100 };
    const one: TextBox = { x: 104, y: 92, width: 8 };
    const label = placeLabel(anchor, { x: 0, y: 40 }, 48, [one]);

    expect(textBoxesOverlap({ ...label, width: 48 }, one)).toBe(false);
    expect(label.y).toBe(94); // 세로선이면 가로로만 비킨다
    expect(label.x).not.toBe(100);
  });

  it('양쪽 다중성 모두 피한다', () => {
    const anchor = { x: 200, y: 100 };
    const obstacles: TextBox[] = [
      { x: 190, y: 92, width: 8 },
      { x: 212, y: 100, width: 8 },
    ];
    const label = placeLabel(anchor, { x: 60, y: 0 }, 48, obstacles);
    for (const o of obstacles) expect(textBoxesOverlap({ ...label, width: 48 }, o)).toBe(false);
  });

  it('왼쪽 끝 밖으로 나가지 않는다', () => {
    expect(placeLabel({ x: 5, y: 50 }, { x: 0, y: 10 }, 40, []).x).toBe(20);
  });
});
