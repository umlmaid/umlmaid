/** 아직 구현하지 않은 메서드에서 던진다. 담당 모듈을 함께 적는다. 예: todo('M2') */
export function todo(module: string): never {
  throw new Error(`TODO(${module}): 아직 구현되지 않았습니다`);
}
