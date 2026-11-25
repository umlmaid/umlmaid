// 담당: M4 동기화·흐름
// «Mediator» 코드 변경과 마우스 변경을 받아 순서대로 처리한다.
// 코드 변경: parse → mergeMetadata → applyLayout → notifyViews
// 마우스 변경: LayoutMetadata만 수정 → applyLayout → notifyViews

import { LayoutEngineFactory } from '../domain/layout/LayoutEngineFactory';
import type { LayoutResult } from '../domain/layout/LayoutResult';
import { hasNodeOverlap } from '../domain/metadata/nodeOverlap';
import { measureNode } from '../domain/layout/nodeSize';
import type { Point } from '../domain/metadata/geometry';
import { LayoutMetadata } from '../domain/metadata/LayoutMetadata';
import { AbstractDiagram } from '../domain/model/diagram';
import { DiagramType } from '../domain/model/types';
import { MermaidParser } from '../infrastructure/parser/MermaidParser';
import { isSuccess } from '../infrastructure/parser/ParseResult';
import { toSourceLines } from '../infrastructure/parser/lines';
import { changeNodeLabel } from '../infrastructure/parser/NodeLabelEditor';
import type { DiagramView } from './DiagramView';
import type { Snapshot } from './Snapshot';

export interface MetadataFactory {
    create(): LayoutMetadata;
    fromJson(json: string): LayoutMetadata;
}

const defaultMetadataFactory: MetadataFactory = {
    create: () => new LayoutMetadata(),
    fromJson: (json) =>
        json ? LayoutMetadata.fromJson(json) : new LayoutMetadata(),
};

export class SyncManager {
    private currentText = '';
    private currentDiagram?: AbstractDiagram;
    private currentMetadata: LayoutMetadata;
    private lastLayout?: LayoutResult;
    private views: DiagramView[] = [];
    private revision = 0;

    constructor(
        private readonly parser = new MermaidParser(),
        private readonly layoutEngineFactory = new LayoutEngineFactory(),
        private readonly metadataFactory: MetadataFactory = defaultMetadataFactory,
    ) {
        this.currentMetadata = metadataFactory.create();
    }

    get text(): string {
        return this.currentText;
    }

    get metadata(): LayoutMetadata {
        return this.currentMetadata;
    }

    addView(view: DiagramView): void {
        this.views.push(view);
    }

    removeView(view: DiagramView): void {
        this.views = this.views.filter((v) => v !== view);
    }

    /** 문법 오류 중에는 마지막 정상 다이어그램을 유지한다. */
    async onTextChanged(text: string): Promise<boolean> {
        this.currentText = text;

        if (toSourceLines(text).length === 0) {
            return this.clear();
        }

        const result = this.parser.parse(text);

        if (!isSuccess(result)) {
            this.revision++;

            for (const view of this.views) {
                view.onParseError(result.errors);
            }

            return false;
        }

        const diagram = result.diagram!;
        this.currentDiagram = diagram;
        this.currentMetadata = this.mergeMetadata(
            this.currentMetadata,
            diagram,
        );

        return this.relayout();
    }

    /** 다른 노드와 겹치지 않는 이동만 적용하고 고정한다. */
    async onCanvasNodeMoved(
        nodeId: string,
        x: number,
        y: number,
    ): Promise<boolean> {
        const size = this.lastLayout?.nodePositions.get(nodeId);

        if (!this.currentDiagram?.getNode(nodeId) || !size) {
            return false;
        }

        if (![x, y].every(Number.isFinite) || x < 0 || y < 0) {
            return false;
        }

        if (
            hasNodeOverlap(
                nodeId,
                { ...size, x, y },
                this.lastLayout!.nodePositions,
            )
        ) {
            return false;
        }

        if (size.x === x && size.y === y) {
            return false;
        }

        this.currentMetadata.setPosition(nodeId, {
            x,
            y,
            width: size.width,
            height: size.height,
            isPinned: true,
        });

        return this.relayout();
    }

    /**
     * 다른 노드와 겹치지 않는 크기 변경만 적용한다.
     * 다른 노드의 위치와 고정 상태는 유지한다.
     */
    async onCanvasNodeResized(
        nodeId: string,
        x: number,
        y: number,
        width: number,
        height: number,
    ): Promise<boolean> {
        const diagram = this.currentDiagram;
        const layout = this.lastLayout;
        const node = diagram?.getNode(nodeId);

        if (!diagram || !layout || !node) {
            return false;
        }

        if (!layout.nodePositions.has(nodeId)) {
            return false;
        }

        if (
            ![x, y, width, height].every(Number.isFinite) ||
            x < 0 ||
            y < 0 ||
            width <= 0 ||
            height <= 0
        ) {
            throw new RangeError('노드 위치와 크기가 올바르지 않습니다.');
        }

        const minimum = measureNode(node);

        const resized = {
            x,
            y,
            width: Math.max(minimum.width, width),
            height: Math.max(minimum.height, height),
            isPinned: true,
        };

        if (hasNodeOverlap(nodeId, resized, layout.nodePositions)) {
            return false;
        }

        const original = layout.nodePositions.get(nodeId)!;

        if (
            original.x === resized.x &&
            original.y === resized.y &&
            original.width === resized.width &&
            original.height === resized.height
        ) {
            return false;
        }

        this.currentMetadata.setPosition(nodeId, resized);

        return this.relayout();
    }

    /** 명시적으로 확정한 표시 이름만 Mermaid 별칭으로 반영한다. */
    async renameNode(nodeId: string, label: string): Promise<boolean> {
        const next = changeNodeLabel(this.currentText, nodeId, label);

        if (next === this.currentText) {
            return false;
        }

        const applied = await this.onTextChanged(next);

        if (applied) {
            for (const view of this.views) {
                view.onTextRestored(next);
            }
        }

        return applied;
    }

    /** 수동 간선 경로와 양 끝 노드의 위치를 유지한다. */
    async onCanvasEdgeRouteChanged(
        edgeId: string,
        waypoints: Point[],
    ): Promise<boolean> {
        const edge = this.currentDiagram?.edges.find(
            (e) => e.id === edgeId,
        );

        if (!edge) {
            return false;
        }

        this.currentMetadata.setEdgeRoute(edgeId, {
            waypoints,
            isManual: true,
        });

        for (const nodeId of [edge.sourceId, edge.targetId]) {
            const position = this.lastLayout?.nodePositions.get(nodeId);

            if (
                position &&
                !this.currentMetadata.getPosition(nodeId)?.isPinned
            ) {
                this.currentMetadata.setPosition(nodeId, {
                    ...position,
                    isPinned: true,
                });
            }
        }

        return this.relayout();
    }

    /** 기억한 위치를 지우고 자동 배치 대상으로 돌린다. */
    async unpinNode(nodeId: string): Promise<boolean> {
        if (!this.currentMetadata.getPosition(nodeId)?.isPinned) {
            return false;
        }

        this.currentMetadata.removePosition(nodeId);

        return this.relayout();
    }

    /** 노드 위치·크기와 수동 간선 경로를 함께 초기화한다. */
    async unpinAll(): Promise<boolean> {
        const diagram = this.currentDiagram;

        if (!diagram) {
            return false;
        }

        const hasPositions = diagram.nodes.some(
            (node) =>
                this.currentMetadata.getPosition(node.id) !== undefined,
        );

        const hasRoutes = diagram.edges.some(
            (edge) =>
                this.currentMetadata.getEdgeRoute(edge.id) !== undefined,
        );

        if (!hasPositions && !hasRoutes) {
            return false;
        }

        this.currentMetadata = this.metadataFactory.create();

        return this.relayout();
    }

    restoreState(snapshot: Snapshot): Promise<boolean> {
        return this.load(snapshot.textState, snapshot.metadataState);
    }

    load(text: string, metadataJson: string): Promise<boolean> {
        this.currentMetadata =
            this.metadataFactory.fromJson(metadataJson);

        for (const view of this.views) {
            view.onTextRestored(text);
        }

        return this.onTextChanged(text);
    }

    private mergeMetadata(
        oldMeta: LayoutMetadata,
        newDiagram: AbstractDiagram,
    ): LayoutMetadata {
        const merged = this.metadataFactory.create();

        for (const node of newDiagram.nodes) {
            const position = oldMeta.getPosition(node.id);

            if (position) {
                merged.setPosition(node.id, position);
            }
        }

        for (const edge of newDiagram.edges) {
            const route = oldMeta.getEdgeRoute(edge.id);

            if (route) {
                merged.setEdgeRoute(edge.id, route);
            }
        }

        return merged;
    }

    private clear(): boolean {
        this.revision++;

        const diagram = new AbstractDiagram(DiagramType.CLASS);

        this.currentDiagram = diagram;
        this.currentMetadata = this.metadataFactory.create();
        this.lastLayout = {
            nodePositions: new Map(),
            edgeRoutes: new Map(),
        };

        this.notifyViews(diagram, this.lastLayout);

        return true;
    }

    private async relayout(): Promise<boolean> {
        const diagram = this.currentDiagram;

        if (!diagram) {
            return false;
        }

        const rev = ++this.revision;
        const engine = this.layoutEngineFactory.getEngine(diagram.type);
        const layout = await engine.applyLayout(
            diagram,
            this.currentMetadata,
        );

        if (rev !== this.revision) {
            return false;
        }

        // 새로 배치한 노드의 자리를 기억한다.
        for (const [id, position] of layout.nodePositions) {
            if (!this.currentMetadata.getPosition(id)) {
                this.currentMetadata.setPosition(id, {
                    ...position,
                    isPinned: false,
                });
            }
        }

        this.lastLayout = layout;
        this.notifyViews(diagram, layout);

        return true;
    }

    private notifyViews(
        diagram: AbstractDiagram,
        layout: LayoutResult,
    ): void {
        for (const view of this.views) {
            view.onDiagramUpdated(diagram, layout);
        }
    }
}