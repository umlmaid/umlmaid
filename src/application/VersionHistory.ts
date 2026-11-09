// 담당: M6 저장·버전·내보내기
// «Caretaker» Snapshot을 보관한다. 실행취소와 버전 복원을 모두 맡는다.
import { todo } from '../todo';
import type { Snapshot } from './Snapshot';

export class VersionHistory {
  private history: Snapshot[] = [];

  push(snapshot: Snapshot): void {
    todo('M6');
  }

  undo(): Snapshot | undefined {
    return todo('M6');
  }

  redo(): Snapshot | undefined {
    return todo('M6');
  }

  restore(id: string): Snapshot | undefined {
    return todo('M6');
  }

  list(): Snapshot[] {
    return [...this.history];
  }
}
