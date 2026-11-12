// 담당: M6 저장·버전·내보내기
// «Caretaker» Snapshot을 보관한다. 실행취소와 버전 복원을 모두 맡는다.
import type { Snapshot } from './Snapshot';

//
// Workspace(M4)가 기대하는 동작:
//   push는 "변경이 끝난 뒤의 상태"를 쌓는다. 현재 상태 = 마지막으로 push했거나 undo/redo로 돌아간 Snapshot.
//   예) push(S0) push(S1) push(S2) → undo()=S1 → undo()=S0 → undo()=undefined → redo()=S1
//   undo한 뒤 push하면 그 뒤의 redo 기록은 버린다.
export class VersionHistory {
  private history: Snapshot[] = [];
  /** 현재 상태의 위치. 기록이 없으면 -1 */
  private index = -1;

  push(snapshot: Snapshot): void {
    this.history = [...this.history.slice(0, this.index + 1), snapshot];
    this.index = this.history.length - 1;
  }

  /** 현재보다 하나 앞의 Snapshot. 더 없으면 undefined */
  undo(): Snapshot | undefined {
    if (!this.canUndo()) return undefined;
    this.index--;
    return this.history[this.index];
  }

  /** undo로 지나온 Snapshot 하나를 다시 앞으로. 없으면 undefined */
  redo(): Snapshot | undefined {
    if (!this.canRedo()) return undefined;
    this.index++;
    return this.history[this.index];
  }

  /** undo()가 Snapshot을 돌려줄 수 있으면 true */
  canUndo(): boolean {
    return this.index > 0;
  }

  /** redo()가 Snapshot을 돌려줄 수 있으면 true */
  canRedo(): boolean {
    return this.index < this.history.length - 1;
  }

  /** 기록을 모두 지운다. 다른 파일을 열 때 쓴다. */
  reset(): void {
    this.history = [];
    this.index = -1;
  }

  /** 해당 버전을 현재 상태로 삼는다. 이후 undo/redo는 그 위치에서 이어진다. 없는 id면 undefined */
  restore(id: string): Snapshot | undefined {
    const found = this.history.findIndex((s) => s.id === id);
    if (found < 0) return undefined;
    this.index = found;
    return this.history[found];
  }

  list(): Snapshot[] {
    return [...this.history];
  }
}