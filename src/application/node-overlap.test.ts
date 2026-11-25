import { describe, expect, it } from 'vitest';
import { SyncManager } from './SyncManager';
import { hasNodeOverlap } from '../domain/metadata/nodeOverlap';

describe('마우스 이동·크기 조절 겹침 방지', () => {
    async function setup() {
        const sync = new SyncManager();

        await sync.onTextChanged(
            'classDiagram\nclass Animal\nclass Dog\nAnimal <|-- Dog',
        );

        return sync;
    }

    it.each([false, true])(
        '고정 여부와 관계없이 다른 노드 안으로 이동할 수 없다: %s',
        async (pinned) => {
            const sync = await setup();
            const animal = sync.metadata.getPosition('Animal')!;

            sync.metadata.setPosition('Animal', {
                ...animal,
                isPinned: pinned,
            });

            const before = sync.metadata.toJson();

            expect(
                await sync.onCanvasNodeMoved(
                    'Dog',
                    animal.x,
                    animal.y,
                ),
            ).toBe(false);

            expect(sync.metadata.toJson()).toBe(before);
        },
    );

    it('다른 노드 전체를 감싸는 확대도 거부한다', async () => {
        const sync = await setup();
        const animal = sync.metadata.getPosition('Animal')!;
        const dog = sync.metadata.getPosition('Dog')!;
        const before = sync.metadata.toJson();
        const code = sync.text;

        expect(
            await sync.onCanvasNodeResized(
                'Animal',
                0,
                0,
                Math.max(
                    animal.x + animal.width,
                    dog.x + dog.width,
                ) + 20,
                Math.max(
                    animal.y + animal.height,
                    dog.y + dog.height,
                ) + 20,
            ),
        ).toBe(false);

        expect(sync.metadata.toJson()).toBe(before);
        expect(sync.text).toBe(code);
    });

    it('빈 공간에서 이동·확대하면 다른 노드를 유지한다', async () => {
        const sync = await setup();
        const before = {
            ...sync.metadata.getPosition('Animal')!,
        };

        expect(
            await sync.onCanvasNodeMoved('Dog', 1000, 1000),
        ).toBe(true);

        expect(
            await sync.onCanvasNodeResized(
                'Dog',
                1000,
                1000,
                300,
                200,
            ),
        ).toBe(true);

        expect(
            sync.metadata.getPosition('Animal'),
        ).toEqual(before);

        expect(
            sync.metadata.getPosition('Dog'),
        ).toMatchObject({
            x: 1000,
            y: 1000,
            width: 300,
            height: 200,
            isPinned: true,
        });
    });

    it('8px 여백을 확보하고 포함 관계도 거부한다', () => {
        const positions = new Map([
            [
                'other',
                {
                    x: 200,
                    y: 100,
                    width: 100,
                    height: 100,
                    isPinned: false,
                },
            ],
        ]);

        expect(
            hasNodeOverlap(
                'self',
                { x: 92, y: 100, width: 100, height: 100 },
                positions,
            ),
        ).toBe(false);

        expect(
            hasNodeOverlap(
                'self',
                { x: 92.1, y: 100, width: 100, height: 100 },
                positions,
            ),
        ).toBe(true);

        expect(
            hasNodeOverlap(
                'self',
                { x: 210, y: 110, width: 20, height: 20 },
                positions,
            ),
        ).toBe(true);

        expect(
            hasNodeOverlap(
                'self',
                { x: 0, y: 0, width: 400, height: 400 },
                positions,
            ),
        ).toBe(true);
    });
});