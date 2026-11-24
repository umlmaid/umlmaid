// 레이블은 표준 Mermaid 별칭으로 기록한다. ID·관계·속성·메시지는 바꾸지 않는다.
import { DiagramType } from '../../domain/model/types';
import { MermaidParser } from './MermaidParser';
import { toSourceLines } from './lines';

export function changeNodeLabel(code: string, nodeId: string, value: string): string {
    const label = value.trim();
    if (!label) throw new Error('이름을 입력해 주세요.');
    if (/[\r\n"\x00-\x1f]/.test(label)) throw new Error('이름에는 줄바꿈, 큰따옴표, 제어 문자를 사용할 수 없습니다.');
    const parser = new MermaidParser();
    const before = parser.parse(code);
    if (!before.diagram || before.errors.length) throw new Error('코드의 문법 오류를 먼저 수정해 주세요.');
    const node = before.diagram.getNode(nodeId);
    if (!node) throw new Error('변경할 노드를 찾을 수 없습니다.');
    if (node.label === label) return code;
    const sequence = before.diagram.type === DiagramType.SEQUENCE;
    const newline = code.includes('\r\n') ? '\r\n' : '\n';
    const raw = code.split(/\r?\n/);
    const lines = toSourceLines(code);
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const id = escape(nodeId);
    const declaration = sequence
        ? new RegExp(`^(?:create\\s+)?(?:participant|actor)\\s+${id}(?=\\s|$)(?:\\s*@\\{.*\\})?(?:\\s+as\\s+.+)?$`, 'u')
        : new RegExp(`^class\\s+${id}(?:~\\S*~)?(?:\\s*\\["[^"]*"\\])?\\s*(?:\\{\\s*\\}?)?$`, 'u');
    let body = false;
    const candidates: number[] = [];
    for (const line of lines.slice(1)) {
        const text = line.text;
        if (!sequence && body) { if (text === '}') body = false; continue; }
        if (declaration.test(text)) candidates.push(line.line - 1);
        if (!sequence && /^class\s+/.test(text) && /\{\s*$/.test(text)) body = true;
    }
    if (candidates.length) {
        for (const index of candidates) {
            if (sequence) raw[index] = raw[index].replace(/(?:\s+as\s+.+)?\s*$/, () => ` as ${label}`);
            else raw[index] = raw[index].replace(new RegExp(`^(\\s*class\\s+${id}(?:~\\S*~)?)(?:\\s*\\["[^"]*"\\])?`, 'u'), (_match, prefix: string) => `${prefix}["${label}"]`);
        }
    } else {
        // 암묵적으로 등장한 노드에는 같은 ID의 명시적 별칭 선언을 추가한다.
        raw.push(sequence ? `participant ${nodeId} as ${label}` : `class ${nodeId}["${label}"]`);
    }
    let next = raw.join(newline);
    let after = parser.parse(next);
    // 제네릭 관계를 뒤에서 참조해 이름이 덮이면 마지막에 별칭을 명시한다.
    if (!after.errors.length && after.diagram?.getNode(nodeId)?.label !== label) {
        next += `${newline}${sequence ? `participant ${nodeId} as ${label}` : `class ${nodeId}["${label}"]`}`;
        after = parser.parse(next);
    }
    if (after.errors.length || !after.diagram || after.diagram.getNode(nodeId)?.label !== label) throw new Error('이 이름을 Mermaid 코드에 반영할 수 없습니다.');
    const expectedNodes = before.diagram.nodes.map((item) => ({ ...item, label: item.id === nodeId ? label : item.label }));
    if (JSON.stringify(before.diagram.edges) !== JSON.stringify(after.diagram.edges) || JSON.stringify(expectedNodes) !== JSON.stringify(after.diagram.nodes)) throw new Error('이름 변경 중 다른 내용이 달라져 작업을 취소했습니다.');
    return next;
}
