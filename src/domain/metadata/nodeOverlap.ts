import type { NodePosition } from './geometry';

/** 노드 사이에 8px 여백을 확보한다. 좌표는 100% 배율 기준이다. */
export function hasNodeOverlap(
    nodeId: string,
    candidate: Pick<NodePosition, 'x' | 'y' | 'width' | 'height'>,
    positions: ReadonlyMap<string, NodePosition>,
): boolean {
    const gap = 8;

    for (const [id, other] of positions) {
        if (id === nodeId) continue;

        if (
            candidate.x < other.x + other.width + gap &&
            candidate.x + candidate.width + gap > other.x &&
            candidate.y < other.y + other.height + gap &&
            candidate.y + candidate.height + gap > other.y
        ) {
            return true;
        }
    }

    return false;
}