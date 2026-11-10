import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeLayoutEngineFactory,
  FakeParser,
  InMemoryVersionHistory,
  inMemoryMetadataFactory,
} from '../testing/fakes';
import { SyncManager } from './SyncManager';
import { CODE_SNAPSHOT_DELAY_MS, Workspace } from './Workspace';

function setup() {
  const sync = new SyncManager(new FakeParser(), new FakeLayoutEngineFactory(), inMemoryMetadataFactory);
  const history = new InMemoryVersionHistory();
  const workspace = new Workspace(sync, history);
  return { sync, history, workspace };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('실행취소 기록 (D-03)', () => {
  it('코드는 입력이 멈춘 뒤 한 번만 기록한다', async () => {
    const { history, workspace } = setup();
    await workspace.editCode('class A');
    await workspace.editCode('class A\nclass B');
    expect(history.list()).toHaveLength(0);
    vi.advanceTimersByTime(CODE_SNAPSHOT_DELAY_MS);
    expect(history.list().map((s) => s.textState)).toEqual(['', 'class A\nclass B']);
  });

  it('문법 오류 상태는 기록하지 않는다', async () => {
    const { history, workspace } = setup();
    await workspace.editCode('!!');
    vi.advanceTimersByTime(CODE_SNAPSHOT_DELAY_MS);
    expect(history.list()).toHaveLength(0);
  });

  it('드래그는 바로 기록하고, 대기 중이던 코드 기록을 먼저 남긴다', async () => {
    const { history, workspace } = setup();
    await workspace.editCode('class A');
    await workspace.moveNode('A', 500, 300);
    const states = history.list().map((s) => [s.textState, s.metadataState.includes('500')]);
    expect(states).toEqual([
      ['', false],
      ['class A', false],
      ['class A', true],
    ]);
  });
});

describe('실행취소·다시실행', () => {
  it('드래그를 되돌리고 다시 실행한다', async () => {
    const { sync, workspace } = setup();
    await workspace.editCode('class A');
    vi.advanceTimersByTime(CODE_SNAPSHOT_DELAY_MS);
    await workspace.moveNode('A', 500, 300);

    await workspace.undo();
    expect(sync.metadata.getPosition('A')).toBeUndefined();
    expect(sync.text).toBe('class A');

    await workspace.redo();
    expect(sync.metadata.getPosition('A')).toMatchObject({ x: 500, y: 300, isPinned: true });
  });

  it('첫 변경도 되돌려 빈 문서로 돌아간다', async () => {
    const { sync, workspace } = setup();
    await workspace.editCode('class A');
    await workspace.undo();
    expect(sync.text).toBe('');
  });

  it('되돌린 뒤 새로 고치면 다시실행 기록은 버려진다', async () => {
    const { sync, workspace } = setup();
    await workspace.editCode('class A');
    vi.advanceTimersByTime(CODE_SNAPSHOT_DELAY_MS);
    await workspace.moveNode('A', 500, 300);
    await workspace.undo();
    await workspace.editCode('class A\nclass B');
    vi.advanceTimersByTime(CODE_SNAPSHOT_DELAY_MS);
    await workspace.redo();
    expect(sync.text).toBe('class A\nclass B');
  });
});
