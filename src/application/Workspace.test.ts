import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeLayoutEngineFactory,
  FakeParser,
  InMemoryVersionHistory,
  inMemoryMetadataFactory,
} from '../testing/fakes';
import type { FileManager } from '../infrastructure/file/FileManager';
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

  it('첫 변경도 되돌려 빈 문서로 돌아가고, 그림도 비워진다', async () => {
    const { sync, workspace } = setup();
    const view = { onDiagramUpdated: vi.fn(), onParseError: vi.fn(), onTextRestored: vi.fn() };
    sync.addView(view);
    await workspace.editCode('class A');
    await workspace.undo();
    expect(sync.text).toBe('');
    expect(view.onDiagramUpdated.mock.lastCall![0].nodes).toEqual([]);
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

  it('전체 고정 해제도 한 번에 되돌린다', async () => {
    const { sync, workspace } = setup();
    await workspace.editCode('class A\nclass B');
    await workspace.moveNode('A', 500, 300);
    await workspace.moveNode('B', 700, 300);
    await workspace.unpinAll();
    expect(sync.metadata.getPosition('A')?.isPinned).toBe(false);
    await workspace.undo();
    expect(sync.metadata.getPosition('A')?.isPinned).toBe(true);
    expect(sync.metadata.getPosition('B')?.isPinned).toBe(true);
  });

  it('버튼 상태: 대기 중인 코드 기록도 되돌릴 수 있고, 그동안은 다시실행이 꺼진다', async () => {
    const { workspace } = setup();
    expect(workspace.canUndo).toBe(false);
    await workspace.editCode('class A');
    expect(workspace.canUndo).toBe(true);
    vi.advanceTimersByTime(CODE_SNAPSHOT_DELAY_MS);
    await workspace.undo();
    expect(workspace.canUndo).toBe(false);
    expect(workspace.canRedo).toBe(true);
    await workspace.editCode('class B');
    expect(workspace.canRedo).toBe(false);
  });

  it('다른 파일을 열면 이전 기록은 버리고, 연 상태에서 더 되돌아가지 않는다', async () => {
    const sync = new SyncManager(new FakeParser(), new FakeLayoutEngineFactory(), inMemoryMetadataFactory);
    const history = new InMemoryVersionHistory();
    const files = { load: async () => ({ code: 'class Z', metadata: '' }) } as unknown as FileManager;
    const workspace = new Workspace(sync, history, files);
    await workspace.editCode('class A');
    vi.advanceTimersByTime(CODE_SNAPSHOT_DELAY_MS);
    await workspace.loadProject(new File([], 'z.mmd'));
    expect(history.list().map((s) => s.textState)).toEqual(['class Z']);
    await workspace.undo();
    expect(sync.text).toBe('class Z');
  });
});
