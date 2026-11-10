import { describe, expect, it } from 'vitest';
import { RelationEdge } from '../../domain/model/edges';
import { ClassNode } from '../../domain/model/nodes';
import { DiagramType, RelationType } from '../../domain/model/types';
import { MermaidParser } from './MermaidParser';
import { isSuccess } from './ParseResult';

const parser = new MermaidParser();

function parseOk(text: string) {
  const result = parser.parse(text);
  expect(result.errors).toEqual([]);
  expect(isSuccess(result)).toBe(true);
  return result.diagram!;
}

const node = (text: string, id: string) => parseOk(text).getNode(id) as ClassNode;
const edges = (text: string) => parseOk(text).edges as RelationEdge[];

describe('클래스 다이어그램: 노드 (FR-01-1)', () => {
  it('클래스, 속성, 메서드를 읽는다', () => {
    const d = parseOk(`classDiagram
      class Animal {
        +String name
        +int age
        +makeSound() void
      }`);
    expect(d.type).toBe(DiagramType.CLASS);
    const a = d.getNode('Animal') as ClassNode;
    expect(a).toBeInstanceOf(ClassNode);
    expect(a.attributes).toEqual(['+String name', '+int age']);
    expect(a.methods).toEqual(['+makeSound() void']);
  });

  it('콜론 문법으로 멤버를 추가한다', () => {
    const a = node(`classDiagram
      Animal : +int age
      Animal : +isMammal()`, 'Animal');
    expect(a.attributes).toEqual(['+int age']);
    expect(a.methods).toEqual(['+isMammal()']);
  });

  it('관계 없이 선언만 된 고립 노드도 nodes에 들어간다', () => {
    const d = parseOk(`classDiagram
      class Lonely
      A <|-- B`);
    expect(d.nodes.map((n) => n.id)).toEqual(['Lonely', 'A', 'B']);
  });

  it('노드 id는 코드 이름 그대로, 다시 파싱해도 같다', () => {
    const text = `classDiagram
      class Box~T~
      Box --> Item`;
    const ids1 = parseOk(text).nodes.map((n) => n.id);
    const ids2 = parseOk(text).nodes.map((n) => n.id);
    expect(ids1).toEqual(['Box', 'Item']);
    expect(ids2).toEqual(ids1);
    expect(parseOk(text).getNode('Box')!.label).toBe('Box<T>');
  });

  it('["표시 이름"]은 label로만 쓰고 id는 그대로다', () => {
    const n = node(`classDiagram
      class Animal["동물"]`, 'Animal');
    expect(n.label).toBe('동물');
  });

  it('<<interface>> 표기와 :::css 표기는 오류 없이 넘어간다', () => {
    const d = parseOk(`classDiagram
      class Shape {
        <<interface>>
        +draw()
      }
      <<abstract>> Base
      class Styled:::someclass`);
    expect((d.getNode('Shape') as ClassNode).methods).toEqual(['+draw()']);
    expect(d.getNode('Base')).toBeDefined();
    expect(d.getNode('Styled')).toBeDefined();
  });
});

describe('클래스 다이어그램: 관계 6종 (FR-05-6)', () => {
  it.each([
    ['A <|-- B', RelationType.INHERITANCE, 'B', 'A'],
    ['B --|> A', RelationType.INHERITANCE, 'B', 'A'],
    ['A <|.. B', RelationType.REALIZATION, 'B', 'A'],
    ['B ..|> A', RelationType.REALIZATION, 'B', 'A'],
    ['A --> B', RelationType.ASSOCIATION, 'A', 'B'],
    ['A -- B', RelationType.ASSOCIATION, 'A', 'B'],
    ['A ..> B', RelationType.DEPENDENCY, 'A', 'B'],
    ['A o-- B', RelationType.AGGREGATION, 'B', 'A'],
    ['A *-- B', RelationType.COMPOSITION, 'B', 'A'],
  ])('%s → %s (source %s, target %s)', (line, type, source, target) => {
    const [e] = edges(`classDiagram\n${line}`);
    expect(e.relationType).toBe(type);
    expect(e.sourceId).toBe(source);
    expect(e.targetId).toBe(target);
  });

  it('다중성과 레이블을 읽는다', () => {
    const [e] = edges(`classDiagram
      Customer "1" --> "*" Ticket : buys`);
    expect(e.multiplicity).toBe('1..*');
    expect(e.label).toBe('buys');
  });

  it('간선 id는 source-종류-target, 중복이면 #n', () => {
    const es = edges(`classDiagram
      A --> B
      A --> B : again
      B <|-- C`);
    expect(es.map((e) => e.id)).toEqual(['A-ASSOCIATION-B', 'A-ASSOCIATION-B#1', 'C-INHERITANCE-B']);
  });
});

describe('클래스 다이어그램: 공식 Mermaid 문서 예제', () => {
  it('Animal 예제', () => {
    const d = parseOk(`---
title: Animal example
---
classDiagram
    note "From Duck till Zebra"
    Animal <|-- Duck
    note for Duck "can fly\\ncan swim\\ncan dive\\ncan help in debugging"
    Animal <|-- Fish
    Animal <|-- Zebra
    Animal : +int age
    Animal : +String gender
    Animal: +isMammal()
    Animal: +mate()
    class Duck{
        +String beakColor
        +swim()
        +quack()
    }
    class Fish{
        -int sizeInFeet
        -canEat()
    }
    class Zebra{
        +bool is_wild
        +run()
    }`);
    expect(d.nodes.map((n) => n.id)).toEqual(['Animal', 'Duck', 'Fish', 'Zebra']);
    expect(d.edges).toHaveLength(3);
    expect((d.getNode('Animal') as ClassNode).methods).toEqual(['+isMammal()', '+mate()']);
  });

  it('BankAccount 예제', () => {
    const a = node(`classDiagram
    class BankAccount
    BankAccount : +String owner
    BankAccount : +Bigdecimal balance
    BankAccount : +deposit(amount)
    BankAccount : +withdrawal(amount)`, 'BankAccount');
    expect(a.attributes).toHaveLength(2);
    expect(a.methods).toHaveLength(2);
  });

  it('관계 표기 예제 (classA~classP)', () => {
    const d = parseOk(`classDiagram
classA <|-- classB
classC *-- classD
classE o-- classF
classG <-- classH
classI -- classJ
classK <.. classL
classM <|.. classN
classO .. classP`);
    expect(d.nodes).toHaveLength(16);
    expect(d.edges).toHaveLength(8);
  });

  it('namespace, direction, 제네릭', () => {
    const d = parseOk(`classDiagram
direction RL
namespace BaseShapes {
    class Triangle
    class Rectangle {
      double width
      double height
    }
}
class Square~Shape~{
    int id
    List~int~ position
    setPoints(List~int~ points)
    getPoints() List~int~
}
Square : -List~string~ messages`);
    expect(d.nodes.map((n) => n.id)).toEqual(['Triangle', 'Rectangle', 'Square']);
    expect((d.getNode('Square') as ClassNode).attributes).toEqual(['int id', 'List~int~ position', '-List~string~ messages']);
  });
});

describe('주석과 좌표 줄 (FR-08-1 관련)', () => {
  it('%% 주석과 %% @umlmaid-layout 줄은 무시한다', () => {
    const d = parseOk(`classDiagram
%% 그냥 주석
A --> B
%% @umlmaid-layout {"positions":{"A":{"x":1,"y":2}},"edgeRoutes":{}}`);
    expect(d.nodes).toHaveLength(2);
  });
});

describe('문법 오류 (FR-01-3)', () => {
  it('오류가 있으면 diagram은 비우고 줄 번호를 알려 준다', () => {
    const result = parser.parse(`classDiagram
A --> B
이건 문법이 아님 ???`);
    expect(result.diagram).toBeUndefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(3);
  });

  it('닫히지 않은 { 는 여는 줄을 알려 준다', () => {
    const result = parser.parse(`classDiagram
class A {
  +x`);
    expect(result.errors.map((e) => e.line)).toEqual([2]);
  });

  it('빈 입력, 모르는 종류는 오류', () => {
    expect(parser.parse('').errors).toHaveLength(1);
    expect(parser.parse('flowchart TD').errors[0].line).toBe(1);
  });
});

describe('성능 (NFR-01)', () => {
  it('노드 30개 코드 파싱이 100ms 안쪽', () => {
    const lines = ['classDiagram'];
    for (let i = 0; i < 30; i++) {
      lines.push(`class C${i} {`, '  +String name', '  +int count', '  +run() void', '}');
      if (i > 0) lines.push(`C${i - 1} <|-- C${i} : extends`);
    }
    const text = lines.join('\n');
    const start = performance.now();
    const d = parseOk(text);
    expect(performance.now() - start).toBeLessThan(100);
    expect(d.nodes).toHaveLength(30);
  });
});
