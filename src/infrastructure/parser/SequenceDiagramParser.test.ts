import { describe, expect, it } from 'vitest';
import { MessageEdge } from '../../domain/model/edges';
import { ParticipantNode } from '../../domain/model/nodes';
import { DiagramType } from '../../domain/model/types';
import { MermaidParser } from './MermaidParser';
import { isSuccess } from './ParseResult';

const parser = new MermaidParser();

function parseOk(text: string) {
  const result = parser.parse(text);
  expect(result.errors).toEqual([]);
  expect(isSuccess(result)).toBe(true);
  return result.diagram!;
}

const participants = (text: string) => parseOk(text).nodes as ParticipantNode[];
const messages = (text: string) => parseOk(text).edges as MessageEdge[];

describe('시퀀스 다이어그램: 참여자 (FR-08-1)', () => {
  it('participant, actor를 등장 순서대로 읽는다', () => {
    const d = parseOk(`sequenceDiagram
      participant Alice
      actor Bob
      Alice->>Bob: Hi`);
    expect(d.type).toBe(DiagramType.SEQUENCE);
    const ps = d.nodes as ParticipantNode[];
    expect(ps.every((p) => p instanceof ParticipantNode)).toBe(true);
    expect(ps.map((p) => [p.id, p.order])).toEqual([['Alice', 0], ['Bob', 1]]);
  });

  it('as 별칭은 label로, id는 코드 이름 그대로', () => {
    const [a, j] = participants(`sequenceDiagram
      participant A as Alice
      participant J as John
      A->>J: Hello`);
    expect([a.id, a.label]).toEqual(['A', 'Alice']);
    expect([j.id, j.label]).toEqual(['J', 'John']);
  });

  it('선언하지 않은 참여자도 메시지에서 처음 나온 순서로 들어간다', () => {
    const ps = participants(`sequenceDiagram
      participant C
      A->>B: x
      B->>C: y`);
    expect(ps.map((p) => p.id)).toEqual(['C', 'A', 'B']);
    expect(ps.map((p) => p.order)).toEqual([0, 1, 2]);
  });

  it('메시지 없이 선언만 된 참여자도 nodes에 들어간다', () => {
    expect(participants(`sequenceDiagram
      participant Lonely`).map((p) => p.id)).toEqual(['Lonely']);
  });
});

describe('시퀀스 다이어그램: 메시지', () => {
  it.each([
    ['->', false],
    ['-->', true],
    ['->>', false],
    ['-->>', true],
    ['-x', false],
    ['--x', true],
    ['-)', false],
    ['--)', true],
    ['<<->>', false],
    ['<<-->>', true],
  ])('%s → isReply %s', (arrow, isReply) => {
    const [m] = messages(`sequenceDiagram\nA${arrow}B: hi`);
    expect(m.sourceId).toBe('A');
    expect(m.targetId).toBe('B');
    expect(m.isReply).toBe(isReply);
    expect(m.label).toBe('hi');
  });

  it('order와 id는 위에서부터 0, 1, 2', () => {
    const ms = messages(`sequenceDiagram
      Alice->>John: Hello
      John-->>Alice: Great!
      Alice-)John: See you`);
    expect(ms.map((m) => [m.id, m.order])).toEqual([['msg-0', 0], ['msg-1', 1], ['msg-2', 2]]);
  });

  it('활성화 표시(+/-)와 레이블 없는 메시지', () => {
    const ms = messages(`sequenceDiagram
      Alice->>+John: Hi
      John-->>-Alice: Bye
      Alice->>John`);
    expect(ms.map((m) => [m.sourceId, m.targetId, m.label])).toEqual([
      ['Alice', 'John', 'Hi'],
      ['John', 'Alice', 'Bye'],
      ['Alice', 'John', ''],
    ]);
  });

  it('자기 자신에게 보내는 메시지', () => {
    const [m] = messages(`sequenceDiagram\nJohn->>John: Fight`);
    expect([m.sourceId, m.targetId]).toEqual(['John', 'John']);
  });
});

describe('시퀀스 다이어그램: 공식 Mermaid 문서 예제', () => {
  it('기본 예제', () => {
    const d = parseOk(`sequenceDiagram
    Alice->>John: Hello John, how are you?
    John-->>Alice: Great!
    Alice-)John: See you later!`);
    expect(d.nodes).toHaveLength(2);
    expect(d.edges).toHaveLength(3);
  });

  it('loop, alt, opt, par, rect, Note, activate, autonumber', () => {
    const d = parseOk(`sequenceDiagram
    autonumber
    participant Alice
    participant John
    rect rgb(191, 223, 255)
    Note right of John: Text in note
    loop Every minute
        John-->>Alice: Great!
    end
    end
    alt is sick
        Bob->>Alice: Not so good :(
    else is well
        Bob->>Alice: Feeling fresh like a daisy
    end
    opt Extra response
        Bob->>Alice: Thanks for asking
    end
    par Alice to Bob
        Alice->>Bob: Hello guys!
    and Alice to John
        Alice->>John: Hello guys!
    end
    activate John
    John-->>Alice: Done
    deactivate John
    Note over Alice,John: A typical interaction`);
    expect(d.nodes.map((n) => n.id)).toEqual(['Alice', 'John', 'Bob']);
    expect(d.edges).toHaveLength(7);
  });

  it('box, create, destroy', () => {
    const d = parseOk(`sequenceDiagram
    box Purple Alice & John
    participant A
    participant J
    end
    A->>J: Hello
    create participant C as Carl
    J->>C: Hi Carl
    destroy C
    C-xJ: We are too many`);
    expect(d.nodes.map((n) => n.label)).toEqual(['A', 'J', 'Carl']);
    expect(d.edges).toHaveLength(3);
  });
});

describe('시퀀스 다이어그램: 문법 오류 (FR-01-3)', () => {
  it('알 수 없는 줄은 줄 번호와 함께 오류', () => {
    const result = parser.parse(`sequenceDiagram
Alice->>John: Hi
이상한 줄`);
    expect(result.diagram).toBeUndefined();
    expect(result.errors.map((e) => e.line)).toEqual([3]);
  });

  it('닫히지 않은 블록, 짝 없는 end', () => {
    expect(parser.parse(`sequenceDiagram
loop forever
A->>B: x`).errors.map((e) => e.line)).toEqual([2]);
    expect(parser.parse(`sequenceDiagram
A->>B: x
end`).errors.map((e) => e.line)).toEqual([3]);
  });

  it('%% @umlmaid-layout 줄은 무시한다', () => {
    expect(messages(`sequenceDiagram
A->>B: x
%% @umlmaid-layout {"positions":{},"edgeRoutes":{}}`)).toHaveLength(1);
  });
});

describe('시퀀스 다이어그램: 성능 (NFR-01)', () => {
  it('참여자 30명, 메시지 100개 파싱이 100ms 안쪽', () => {
    const lines = ['sequenceDiagram'];
    for (let i = 0; i < 30; i++) lines.push(`participant P${i}`);
    for (let i = 0; i < 100; i++) lines.push(`P${i % 30}->>P${(i + 1) % 30}: call ${i}`);
    const start = performance.now();
    const d = parseOk(lines.join('\n'));
    expect(performance.now() - start).toBeLessThan(100);
    expect(d.nodes).toHaveLength(30);
    expect(d.edges).toHaveLength(100);
  });
});
