// 담당: M5 화면
// 그리기만 한다. 드래그 등 마우스 입력은 Workspace로 넘기고 데이터를 직접 바꾸지 않는다.
// 노드 글자는 100% 배율에서 12px 이상이어야 한다(NFR-07).
export const MIN_FONT_SIZE = 12;

export function CanvasRenderer() {
  return <svg width="100%" height="100%"><text x={16} y={32} fontSize={MIN_FONT_SIZE}>TODO(M5): 캔버스</text></svg>;
}
