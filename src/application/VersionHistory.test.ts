// 담당: M6 저장·버전·내보내기
import { describe, expect, it } from 'vitest';
import type { Snapshot } from './Snapshot';
import { VersionHistory } from './VersionHistory';

const snap = (id: string): Snapshot => ({ id, textState: `code-${id}`, metadataState: '', timestamp: new Date(0) });
const ids = (list: Snapshot[]) => list.map((s) => s.id);

function historyOf(...names: string[]): VersionHistory {
  const h = new VersionHistory();
  for (const n of names) h.push(snap(n));
  return h;
}

describe('VersionHistory', () => {
  it('기록이 없으면 undo·redo는 undefined이고 버튼 조건은 false다', () => {
    const h = new VersionHistory();
    expect(h.undo()).toBeUndefined();
    expect(h.redo()).toBeUndefined();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it('기록이 하나뿐이면 되돌릴 곳이 없다', () => {
    const h = historyOf('S0');
    expect(h.canUndo()).toBe(false);
    expect(h.undo()).toBeUndefined();
  });

  it('주석의 예: push S0 S1 S2 → undo S1 → undo S0 → undo undefined → redo S1', () => {
    const h = historyOf('S0', 'S1', 'S2');
    expect(h.undo()?.id).toBe('S1');
    expect(h.undo()?.id).toBe('S0');
    expect(h.undo()).toBeUndefined();
    expect(h.redo()?.id).toBe('S1');
  });

  it('canUndo·canRedo가 위치에 맞게 바뀐다', () => {
    const h = historyOf('S0', 'S1');
    expect([h.canUndo(), h.canRedo()]).toEqual([true, false]);
    h.undo();
    expect([h.canUndo(), h.canRedo()]).toEqual([false, true]);
    h.redo();
    expect([h.canUndo(), h.canRedo()]).toEqual([true, false]);
  });

  it('undo한 뒤 push하면 그 뒤의 redo 기록은 버린다', () => {
    const h = historyOf('S0', 'S1', 'S2');
    h.undo(); // S1
    h.push(snap('S3'));
    expect(ids(h.list())).toEqual(['S0', 'S1', 'S3']);
    expect(h.canRedo()).toBe(false);
    expect(h.undo()?.id).toBe('S1');
  });

  it('reset하면 기록이 모두 사라진다', () => {
    const h = historyOf('S0', 'S1');
    h.reset();
    expect(h.list()).toEqual([]);
    expect([h.canUndo(), h.canRedo()]).toEqual([false, false]);
    h.push(snap('N0'));
    expect(h.canUndo()).toBe(false);
  });

  it('restore는 해당 버전을 현재로 삼고, 이후 undo·redo가 그 위치에서 이어진다', () => {
    const h = historyOf('S0', 'S1', 'S2');
    expect(h.restore('S0')?.id).toBe('S0');
    expect(h.canUndo()).toBe(false);
    expect(h.redo()?.id).toBe('S1');
  });

  it('없는 id를 restore하면 undefined이고 현재 위치는 그대로다', () => {
    const h = historyOf('S0', 'S1');
    expect(h.restore('없음')).toBeUndefined();
    expect(h.undo()?.id).toBe('S0');
  });

  it('list는 복사본이라 바꿔도 기록에 영향이 없다', () => {
    const h = historyOf('S0');
    h.list().push(snap('X'));
    expect(ids(h.list())).toEqual(['S0']);
  });
});