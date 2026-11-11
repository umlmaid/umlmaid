// 담당: M2 레이아웃 엔진
// 노드 크기 추정. 엔진은 화면(M5)을 모르므로 글자 수로 크기를 어림잡는다.
// 상수를 바꾸면 CanvasRenderer가 그리는 크기와 어긋날 수 있으니 M5 담당과 맞춘다.
import { AbstractNode, ClassNode, ParticipantNode } from '../model/nodes';

export interface Size {
  width: number;
  height: number;
}

const CHAR_W = 8; // 반각 글자 1개 너비(px)
const LINE_H = 20;
const PAD_X = 12;
const PAD_Y = 8;
const CLASS_MIN_W = 120;
const PARTICIPANT_MIN_W = 100;
const PARTICIPANT_H = 40;

/** 한글 같은 전각 글자는 반각의 2배로 센다 */
function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += (ch.codePointAt(0) ?? 0) > 0x7f ? CHAR_W * 2 : CHAR_W;
  return w;
}

export function measureNode(node: AbstractNode): Size {
  if (node instanceof ClassNode) {
    const header = node.stereotype ? [`«${node.stereotype}»`, node.label] : [node.label];
    const widest = Math.max(...[...header, ...node.attributes, ...node.methods].map(textWidth));
    // 이름·속성·메서드 칸은 비어 있어도 칸을 그린다(UML 표준)
    const section = (lines: number) => lines * LINE_H + PAD_Y * 2;
    return {
      width: Math.max(CLASS_MIN_W, widest + PAD_X * 2),
      height: section(header.length) + section(node.attributes.length) + section(node.methods.length),
    };
  }
  if (node instanceof ParticipantNode) {
    return { width: Math.max(PARTICIPANT_MIN_W, textWidth(node.label) + PAD_X * 2), height: PARTICIPANT_H };
  }
  return { width: CLASS_MIN_W, height: LINE_H + PAD_Y * 2 };
}