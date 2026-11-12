// 담당: M1 파서·모델
// Mermaid sequenceDiagram → AbstractDiagram(ParticipantNode, MessageEdge)
//
// 팀 약속:
// - 노드 id = 코드에 쓴 참여자 이름. `participant A as Alice` → id "A", label "Alice"
// - 참여자 order = 처음 등장한 순서(선언이든 메시지든), 0부터
// - 메시지 id = `msg-${order}`, order는 위에서부터 0, 1, 2...
// - 점선 화살표(-->, -->>, --x, --))는 응답(isReply = true)
// - 비동기 화살표(-), --))는 isAsync = true
// - 이 도구가 그리지 않는 문법(Note, loop/alt 등 블록, activate, autonumber 등)은 오류 없이 넘어간다.
//   블록 안의 메시지는 그대로 읽는다.
import { AbstractDiagram } from '../../domain/model/diagram';
import { MessageEdge } from '../../domain/model/edges';
import { ParticipantNode } from '../../domain/model/nodes';
import { DiagramType } from '../../domain/model/types';
import { errorAt, type SourceLine } from './lines';
import type { SyntaxError, ParseResult } from './ParseResult';

const NAME = String.raw`[\p{L}\p{N}_]+(?:-(?![-x)>])[\p{L}\p{N}_]+)*`;
// 긴 것부터: <<-->>, <<->>, -->>, ->>, -->, ->, --x, -x, --), -)
const ARROW = String.raw`<<-->>|<<->>|-->>|->>|-->|->|--x|-x|--\)|-\)`;

const MESSAGE = new RegExp(
    String.raw`^(${NAME})\s*(${ARROW})\s*[+-]?\s*(${NAME})\s*(?::(.*))?$`,
    'u',
);
const PARTICIPANT = new RegExp(
    String.raw`^(?:create\s+)?(participant|actor)\s+(${NAME})(?:\s*@\{.*\})?(?:\s+as\s+(.+))?$`,
    'u',
);
const BLOCK_OPEN = /^(loop|alt|opt|par|critical|break|rect|box)\b/;
const BLOCK_MIDDLE = /^(else|and|option)\b/;
const IGNORED =
    /^(note|activate|deactivate|autonumber|title|accTitle|accDescr|destroy|link|links|properties|details)\b/i;

export function parseSequenceDiagram(lines: SourceLine[]): ParseResult {
    const participants = new Map<string, string>(); // id → label, 등장 순서 유지
    const messages: MessageEdge[] = [];
    const errors: SyntaxError[] = [];
    const blocks: SourceLine[] = [];

    const ensureParticipant = (id: string) => {
        if (!participants.has(id)) participants.set(id, id);
    };

    for (const src of lines) {
        const text = src.text;

        if (text === 'end') {
            if (blocks.pop() === undefined) {
                errors.push(
                    errorAt(src, '여는 블록(loop, alt 등) 없이 end가 나왔습니다'),
                );
            }
            continue;
        }

        if (BLOCK_OPEN.test(text)) {
            blocks.push(src);
            continue;
        }

        if (BLOCK_MIDDLE.test(text)) {
            if (blocks.length === 0) {
                errors.push(
                    errorAt(src, `블록 밖에서 ${text.split(/\s/)[0]}가 나왔습니다`),
                );
            }
            continue;
        }

        const decl = PARTICIPANT.exec(text);
        if (decl) {
            const [, , id, alias] = decl;
            ensureParticipant(id);
            if (alias !== undefined) participants.set(id, alias.trim());
            continue;
        }

        if (IGNORED.test(text)) continue;

        const msg = MESSAGE.exec(text);
        if (msg) {
            const [, from, arrow, to, label = ''] = msg;
            ensureParticipant(from);
            ensureParticipant(to);

            const order = messages.length;

            // 기존 팀 약속 유지: 점선 메시지는 isReply로 구분한다.
            const isReply = arrow.startsWith('--') || arrow === '<<-->>';

            // 열린 화살촉 문법은 비동기 호출로 구분한다.
            const isAsync = arrow === '-)' || arrow === '--)';

            messages.push(
                new MessageEdge(
                    `msg-${order}`,
                    from,
                    to,
                    order,
                    isReply,
                    label.trim(),
                    isAsync,
                ),
            );
            continue;
        }

        errors.push(errorAt(src, `알 수 없는 문장입니다: ${text}`));
    }

    for (const open of blocks) {
        errors.push(
            errorAt(
                open,
                `${open.text.split(/\s/)[0]} 블록이 end로 닫히지 않았습니다`,
            ),
        );
    }

    if (errors.length > 0) return { errors };

    const nodes = [...participants].map(
        ([id, label], order) => new ParticipantNode(id, label, order),
    );

    return {
        diagram: new AbstractDiagram(DiagramType.SEQUENCE, nodes, messages),
        errors: [],
    };
}