import { describe, expect, it } from 'vitest';
import { Workspace } from './Workspace';
import { SyncManager } from './SyncManager';
import type { LayoutResult } from '../domain/layout/LayoutResult';

function setup() {
    const sync = new SyncManager();
    let layout: LayoutResult | undefined;
    sync.addView({ onDiagramUpdated(_diagram, next) { layout = next; }, onParseError(errors) { throw new Error(JSON.stringify(errors)); }, onTextRestored() {} });
    return { sync, current: () => layout! };
}

describe('전체 고정 해제는 간선의 수동 경로도 초기화한다', () => {
    it('클래스 경로와 위치를 자동 배치로 되돌리고, 실행취소·다시실행·저장을 지원한다', async () => {
        const { sync, current } = setup();
        const workspace = new Workspace(sync);
        const code = 'classDiagram\n Animal <|-- Dog\n Animal <|-- Cat';
        await workspace.editCode(code);
        const initial = current();
        const edgeId = 'Cat-INHERITANCE-Animal';
        const manual = [{ x: 480, y: 240 }];
        await workspace.updateEdgeRoute(edgeId, manual);
        await workspace.unpinAll();
        expect(sync.text).toBe(code);
        expect(sync.metadata.getEdgeRoute(edgeId)).toBeUndefined();
        expect(current().edgeRoutes.get(edgeId)).toEqual(initial.edgeRoutes.get(edgeId));
        expect([...current().nodePositions.values()].every((pos) => !pos.isPinned)).toBe(true);
        await workspace.undo();
        expect(current().edgeRoutes.get(edgeId)).toEqual({ waypoints: manual, isManual: true });
        await workspace.redo();
        expect(current().edgeRoutes.get(edgeId)).toEqual(initial.edgeRoutes.get(edgeId));
        const saved = await workspace.saveProject().text();
        expect(JSON.parse(saved.split('%% @umlmaid-layout ')[1]).edgeRoutes).toEqual({});
        await workspace.loadProject(new File([saved], 'reset.mmd'));
        expect(current().edgeRoutes.get(edgeId)?.isManual).toBe(false);
    });

    it('노드 위치 메타데이터 없이 수동 간선만 있어도 초기화한다', async () => {
        const { sync, current } = setup();
        await sync.onTextChanged('classDiagram\n A --> B');
        await sync.onCanvasEdgeRouteChanged('A-ASSOCIATION-B', [{ x: 400, y: 300 }]);
        sync.metadata.removePosition('A');
        sync.metadata.removePosition('B');
        expect(await sync.unpinAll()).toBe(true);
        expect(sync.metadata.getEdgeRoute('A-ASSOCIATION-B')).toBeUndefined();
        expect(current().edgeRoutes.get('A-ASSOCIATION-B')?.isManual).toBe(false);
    });

    it('시퀀스의 수동 메시지 경로도 자동 경로로 되돌린다', async () => {
        const { sync, current } = setup();
        const code = 'sequenceDiagram\n participant A\n participant B\n A->>B: 요청';
        await sync.onTextChanged(code);
        const initial = current().edgeRoutes.get('msg-0');
        await sync.onCanvasEdgeRouteChanged('msg-0', [{ x: 90, y: 160 }, { x: 180, y: 200 }, { x: 250, y: 160 }]);
        expect(await sync.unpinAll()).toBe(true);
        expect(current().edgeRoutes.get('msg-0')).toEqual(initial);
        expect(sync.text).toBe(code);
    });

    it('문서가 없거나 빈 문서이면 상태를 바꾸지 않는다', async () => {
        const { sync } = setup();
        expect(await sync.unpinAll()).toBe(false);
        await sync.onTextChanged('');
        expect(await sync.unpinAll()).toBe(false);
    });
});
