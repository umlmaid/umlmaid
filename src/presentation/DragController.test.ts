import { afterEach, describe, expect, it, vi } from 'vitest';
import { Workspace } from '../application/Workspace';
import { DragController } from './DragController';

function setup() {
  const workspace = new Workspace();
  const calls = {
    moveNode: vi.spyOn(workspace, 'moveNode').mockResolvedValue(undefined),
    updateEdgeRoute: vi.spyOn(workspace, 'updateEdgeRoute').mockResolvedValue(undefined),
    unpinNode: vi.spyOn(workspace, 'unpinNode').mockResolvedValue(undefined),
  };
  return { workspace, calls, controller: new DragController(workspace) };
}

afterEach(() => vi.restoreAllMocks());

describe('노드 드래그 입력', () => {
  it.each([
    { zoom: 1, x: 120, y: -60 },
    { zoom: 2, x: 60, y: -30 },
    { zoom: 0.5, x: 240, y: -120 },
  ])('배율 $zoom에서 좌표를 변환하고 노드 ID를 전달한다', ({ zoom, x, y }) => {
    const { controller, calls } = setup();
    const screen = Object.freeze({ x: 120, y: -60 });
    const result = controller.onNodeDragEnd('node-A', screen, zoom);

    expect(calls.moveNode).toHaveBeenCalledExactlyOnceWith('node-A', x, y);
    expect(calls.updateEdgeRoute).not.toHaveBeenCalled();
    expect(calls.unpinNode).not.toHaveBeenCalled();
    expect(screen).toEqual({ x: 120, y: -60 });
    expect(result).toBeUndefined();
  });
});

describe('간선 경유점 입력', () => {
  it.each([
    { zoom: 1, points: [{ x: 80, y: -20 }, { x: 151, y: 60 }] },
    { zoom: 2, points: [{ x: 40, y: -10 }, { x: 75.5, y: 30 }] },
    { zoom: 0.5, points: [{ x: 160, y: -40 }, { x: 302, y: 120 }] },
  ])('배율 $zoom에서 모든 경유점과 간선 ID를 전달하고 원본을 보존한다', ({ zoom, points }) => {
    const { controller, calls } = setup();
    const screenPoints = [Object.freeze({ x: 80, y: -20 }), Object.freeze({ x: 151, y: 60 })];
    Object.freeze(screenPoints);
    const result = controller.onEdgeWaypointsChanged('A-ASSOCIATION-B#2', screenPoints, zoom);

    expect(calls.updateEdgeRoute).toHaveBeenCalledExactlyOnceWith('A-ASSOCIATION-B#2', points);
    const forwarded = calls.updateEdgeRoute.mock.calls[0][1];
    expect(forwarded).not.toBe(screenPoints);
    expect(forwarded[0]).not.toBe(screenPoints[0]);
    forwarded[0].x = 999;
    forwarded.push({ x: 0, y: 0 });
    expect(screenPoints).toEqual([{ x: 80, y: -20 }, { x: 151, y: 60 }]);
    expect(calls.moveNode).not.toHaveBeenCalled();
    expect(calls.unpinNode).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('빈 경유점 배열도 전달한다', () => {
    const { controller, calls } = setup();
    controller.onEdgeWaypointsChanged('edge-empty', [], 2);
    expect(calls.updateEdgeRoute).toHaveBeenCalledExactlyOnceWith('edge-empty', []);
  });
});

describe('고정 해제 입력', () => {
  it('해당 노드 ID로 Workspace의 고정 해제를 요청한다', () => {
    const { controller, calls } = setup();
    expect(controller.onUnpinRequested('node-B')).toBeUndefined();
    expect(calls.unpinNode).toHaveBeenCalledExactlyOnceWith('node-B');
    expect(calls.moveNode).not.toHaveBeenCalled();
    expect(calls.updateEdgeRoute).not.toHaveBeenCalled();
  });
});

describe('줌 검증', () => {
  it.each([0, -0, -1, NaN, Infinity, -Infinity])('유효하지 않은 배율 %s를 거부하고 Workspace를 호출하지 않는다', (zoom) => {
    const { controller, calls } = setup();
    expect(() => controller.onNodeDragEnd('node-A', { x: 10, y: 20 }, zoom)).toThrow(RangeError);
    expect(() => controller.onEdgeWaypointsChanged('edge-A', [{ x: 10, y: 20 }], zoom)).toThrow(RangeError);
    // 경유점이 없어도 잘못된 배율을 허용하지 않는다.
    expect(() => controller.onEdgeWaypointsChanged('edge-empty', [], zoom)).toThrow(RangeError);
    expect(calls.moveNode).not.toHaveBeenCalled();
    expect(calls.updateEdgeRoute).not.toHaveBeenCalled();
    expect(calls.unpinNode).not.toHaveBeenCalled();
  });
});

const operations = [
  { operation: 'moveNode', id: 'node-A', invoke: (controller: DragController) => controller.onNodeDragEnd('node-A', { x: 20, y: 40 }, 2) },
  { operation: 'updateEdgeRoute', id: 'edge-A', invoke: (controller: DragController) => controller.onEdgeWaypointsChanged('edge-A', [{ x: 20, y: 40 }], 2) },
  { operation: 'unpinNode', id: 'node-B', invoke: (controller: DragController) => controller.onUnpinRequested('node-B') },
] as const;

describe('Workspace 실패 처리', () => {
  it.each(operations)('$operation 비동기 실패를 작업·ID·원본 오류와 함께 보고한다', async ({ operation, id, invoke }) => {
    const { controller, calls } = setup();
    const failure = new Error('layout failed');
    calls[operation].mockRejectedValueOnce(failure);
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(invoke(controller)).toBeUndefined();
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledExactlyOnceWith(`DragController.${operation} failed`, id, failure);
    });
  });

  it.each(operations)('$operation 성공 시 오류를 보고하지 않는다', async ({ operation, invoke }) => {
    const { controller, calls } = setup();
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    invoke(controller);
    await calls[operation].mock.results[0].value;
    expect(report).not.toHaveBeenCalled();
  });

  it.each(operations)('$operation 동기 예외는 호출자에게 전파한다', ({ operation, invoke }) => {
    const { controller, calls } = setup();
    const failure = new Error('synchronous failure');
    calls[operation].mockImplementationOnce(() => { throw failure; });
    expect(() => invoke(controller)).toThrow(failure);
  });
});

describe('Workspace를 통한 전달 경계', () => {
  it('메타데이터를 직접 변경하거나 Mermaid 편집 API를 호출하지 않는다', () => {
    const { workspace, controller } = setup();
    const metadata = workspace.syncManager.metadata;
    const setPosition = vi.spyOn(metadata, 'setPosition');
    const setEdgeRoute = vi.spyOn(metadata, 'setEdgeRoute');
    const setPinned = vi.spyOn(metadata, 'setPinned');
    const editCode = vi.spyOn(workspace, 'editCode');
    const originalText = workspace.syncManager.text;

    controller.onNodeDragEnd('node-A', { x: 20, y: 40 }, 2);
    controller.onEdgeWaypointsChanged('edge-A', [{ x: 20, y: 40 }], 2);
    controller.onUnpinRequested('node-A');

    expect(setPosition).not.toHaveBeenCalled();
    expect(setEdgeRoute).not.toHaveBeenCalled();
    expect(setPinned).not.toHaveBeenCalled();
    expect(editCode).not.toHaveBeenCalled();
    expect(workspace.syncManager.text).toBe(originalText);
  });
});
