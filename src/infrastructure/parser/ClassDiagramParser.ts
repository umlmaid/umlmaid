// 담당: M1 파서·모델
// Mermaid classDiagram → AbstractDiagram(ClassNode, RelationEdge)
//
// 팀 약속:
// - 노드 id = 코드에 쓴 클래스 이름(제네릭 ~T~ 제외). 예: `class Box~T~` → id "Box", label "Box<T>"
// - 간선 id = `${sourceId}-${RelationType}-${targetId}`, 같은 조합이 또 나오면 `#1`, `#2`...
// - sourceId = 화살표 꼬리 쪽, targetId = 화살표 머리(◁, ◆, ◇, >) 쪽.
//   예: `A <|-- B` → source B, target A (B가 A를 상속)
// - 다중성: `"1" --> "*"` → "1..*" (source쪽..target쪽). 한쪽만 있으면 "1.." / "..*"
// - 이 도구가 그리지 않는 문법(note, style, direction 등)은 오류 없이 넘어간다.
import { AbstractDiagram } from '../../domain/model/diagram';
import { RelationEdge } from '../../domain/model/edges';
import { ClassNode } from '../../domain/model/nodes';
import { DiagramType, RelationType } from '../../domain/model/types';
import { errorAt, type SourceLine } from './lines';
import type { ParseError, ParseResult } from './ParseResult';

const NAME = String.raw`[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)*(?:~\S*~)?`;
const LEFT_HEAD = String.raw`<\||\*|o|<|\(\)`;
const RIGHT_HEAD = String.raw`\|>|\*|o|>|\(\)`;

const RELATION = new RegExp(
  String.raw`^(${NAME})\s*(?:"([^"]*)"\s*)?(${LEFT_HEAD})?(--|\.\.)(${RIGHT_HEAD})?\s*(?:"([^"]*)"\s*)?(${NAME})\s*(?::\s*(.*))?$`,
  'u',
);
const CLASS_DECL = new RegExp(String.raw`^class\s+(${NAME})(?:\s*\["([^"]*)"\])?\s*(\{)?\s*(\})?$`, 'u');
const MEMBER = new RegExp(String.raw`^(${NAME})\s*:\s*(.+)$`, 'u');
const ANNOTATION = new RegExp(String.raw`^<<[^>]+>>\s*(${NAME})$`, 'u');
const NAMESPACE_OPEN = /^namespace\s+[\p{L}\p{N}_.\-]+\s*\{$/u;
const IGNORED = /^(direction|style|classDef|cssClass|click|callback|link|accTitle|accDescr|title|note)\b/;
const BLOCK_IGNORED = /^accDescr\s*\{/;
const CSS_SHORTHAND = /:::[\w-]+/g;

interface ClassDraft {
  label: string;
  attributes: string[];
  methods: string[];
}

export function parseClassDiagram(lines: SourceLine[]): ParseResult {
  const classes = new Map<string, ClassDraft>();
  const edges: RelationEdge[] = [];
  const edgeIdCount = new Map<string, number>();
  const errors: ParseError[] = [];

  /** 지금 몸통 { } 안에 있는 클래스와 그 시작 줄 */
  let body: { id: string; open: SourceLine } | undefined;
  const namespaces: SourceLine[] = [];
  let skipBlock: SourceLine | undefined;

  const ensureClass = (rawName: string): string => {
    const id = baseName(rawName);
    if (!classes.has(id)) classes.set(id, { label: genericLabel(rawName), attributes: [], methods: [] });
    else if (rawName.includes('~')) classes.get(id)!.label = genericLabel(rawName);
    return id;
  };

  for (const src of lines) {
    const text = src.text.replace(CSS_SHORTHAND, '').trim();

    if (skipBlock) {
      if (text === '}') skipBlock = undefined;
      continue;
    }

    if (body) {
      if (text === '}') body = undefined;
      else if (!text.startsWith('<<')) addMember(classes.get(body.id)!, text);
      continue;
    }

    if (text === '}') {
      if (namespaces.pop() === undefined) errors.push(errorAt(src, '여는 { 없이 } 가 나왔습니다'));
      continue;
    }
    if (BLOCK_IGNORED.test(text)) {
      if (!text.endsWith('}')) skipBlock = src;
      continue;
    }
    if (IGNORED.test(text)) continue;
    if (NAMESPACE_OPEN.test(text)) {
      namespaces.push(src);
      continue;
    }

    const decl = CLASS_DECL.exec(text);
    if (decl) {
      const [, rawName, label, open, close] = decl;
      const id = ensureClass(rawName);
      if (label !== undefined) classes.get(id)!.label = label;
      if (open && !close) body = { id, open: src };
      continue;
    }

    const rel = RELATION.exec(text);
    if (rel) {
      edges.push(toEdge(rel, ensureClass, edgeIdCount));
      continue;
    }

    const member = MEMBER.exec(text);
    if (member) {
      addMember(classes.get(ensureClass(member[1]))!, member[2].trim());
      continue;
    }

    const annotation = ANNOTATION.exec(text);
    if (annotation) {
      ensureClass(annotation[1]);
      continue;
    }

    errors.push(errorAt(src, `알 수 없는 문장입니다: ${src.text}`));
  }

  if (body) errors.push(errorAt(body.open, `클래스 ${body.id}의 { 가 닫히지 않았습니다`));
  if (skipBlock) errors.push(errorAt(skipBlock, '{ 가 닫히지 않았습니다'));
  for (const ns of namespaces) errors.push(errorAt(ns, 'namespace의 { 가 닫히지 않았습니다'));

  if (errors.length > 0) return { errors };

  const nodes = [...classes].map(([id, c]) => new ClassNode(id, c.label, c.attributes, c.methods));
  return { diagram: new AbstractDiagram(DiagramType.CLASS, nodes, edges), errors: [] };
}

function addMember(draft: ClassDraft, member: string): void {
  if (member === '') return;
  if (/\(.*\)/.test(member)) draft.methods.push(member);
  else draft.attributes.push(member);
}

function toEdge(
  match: RegExpExecArray,
  ensureClass: (rawName: string) => string,
  edgeIdCount: Map<string, number>,
): RelationEdge {
  const [, leftName, leftCard = '', leftHead, line, rightHead, rightCard = '', rightName, label = ''] = match;
  const left = ensureClass(leftName);
  const right = ensureClass(rightName);
  const dashed = line === '..';

  // 머리가 있는 쪽이 target. 머리가 없으면 왼쪽 → 오른쪽.
  const headOnLeft = leftHead !== undefined;
  const head = headOnLeft ? leftHead : rightHead;
  const [sourceId, targetId] = headOnLeft ? [right, left] : [left, right];
  const [sourceCard, targetCard] = headOnLeft ? [rightCard, leftCard] : [leftCard, rightCard];

  const type = relationType(head, dashed);
  const baseId = `${sourceId}-${type}-${targetId}`;
  const n = edgeIdCount.get(baseId) ?? 0;
  edgeIdCount.set(baseId, n + 1);
  const id = n === 0 ? baseId : `${baseId}#${n}`;

  const multiplicity = sourceCard || targetCard ? `${sourceCard}..${targetCard}` : '';
  return new RelationEdge(id, sourceId, targetId, type, multiplicity, label.trim());
}

function relationType(head: string | undefined, dashed: boolean): RelationType {
  switch (head) {
    case '<|':
    case '|>':
      return dashed ? RelationType.REALIZATION : RelationType.INHERITANCE;
    case '()':
      return RelationType.REALIZATION;
    case '*':
      return RelationType.COMPOSITION;
    case 'o':
      return RelationType.AGGREGATION;
    default:
      // '<', '>', 또는 머리 없음
      return dashed ? RelationType.DEPENDENCY : RelationType.ASSOCIATION;
  }
}

/** `Box~T~` → `Box` */
function baseName(rawName: string): string {
  return rawName.split('~')[0];
}

/** `Box~List~int~~` → `Box<List<int>>` */
function genericLabel(rawName: string): string {
  const i = rawName.indexOf('~');
  const j = rawName.lastIndexOf('~');
  if (i < 0 || j <= i) return rawName;
  return `${rawName.slice(0, i)}<${genericLabel(rawName.slice(i + 1, j))}>${rawName.slice(j + 1)}`;
}
