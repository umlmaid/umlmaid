// 담당: M6 저장·버전·내보내기
// «Caretaker» Snapshot을 보관한다. 실행취소와 버전 복원을 모두 맡는다.
import { todo } from '../todo';
import type { Snapshot } from './Snapshot';

//
// Workspace(M4)가 기대하는 동작:
//   push는 "변경이 끝난 뒤의 상태"를 쌓는다. 현재 상태 = 마지막으로 push했거나 undo/redo로 돌아간 Snapshot.
//   예) push(S0) push(S1) push(S2) → undo()=S1 → undo()=S0 → undo()=undefined → redo()=S1
//   undo한 뒤 push하면 그 뒤의 redo 기록은 버린다.
export class VersionHistory {
  private history: Snapshot[] = [];

  push(snapshot: Snapshot): void {
    todo('M6');
  }

  /** 현재보다 하나 앞의 Snapshot. 더 없으면 undefined */
  undo(): Snapshot | undefined {
    return todo('M6');
  }

  /** undo로 지나온 Snapshot 하나를 다시 앞으로. 없으면 undefined */
  redo(): Snapshot | undefined {
    return todo('M6');
  }

  /** undo()가 Snapshot을 돌려줄 수 있으면 true */
  canUndo(): boolean {
    return todo('M6');
  }

  /** redo()가 Snapshot을 돌려줄 수 있으면 true */
  canRedo(): boolean {
    return todo('M6');
  }

  restore(id: string): Snapshot | undefined {
    return todo('M6');
  }

  list(): Snapshot[] {
    return [...this.history];
  }
}
