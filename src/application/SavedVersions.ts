// 담당: M6 저장·버전·내보내기
// «Caretaker» 사용자가 "버전 저장"으로 남긴 이름 붙은 Snapshot을 보관한다(인터뷰 추가: "버전 버튼?", OQ-01).
// 실행취소 기록(VersionHistory)과 따로 둔다. 실행취소 기록은 되돌린 뒤 새로 고치면 뒤쪽이 버려지지만,
// 버전은 사용자가 지울 때까지 남고 프로젝트 파일에도 함께 저장된다.
import type { Snapshot } from './Snapshot';

export interface SavedVersion extends Snapshot {
  name: string;
}

export class SavedVersions {
  private versions: SavedVersion[] = [];
  private count = 0;

  /** 이름이 비어 있으면 "버전 N"으로 붙인다 */
  add(name: string, textState: string, metadataState: string, timestamp = new Date()): SavedVersion {
    this.count++;
    const version: SavedVersion = {
      id: `version-${this.count}`,
      name: name.trim() || `버전 ${this.count}`,
      textState,
      metadataState,
      timestamp,
    };
    this.versions.push(version);
    return version;
  }

  get(id: string): SavedVersion | undefined {
    return this.versions.find((v) => v.id === id);
  }

  /** 지웠으면 true */
  remove(id: string): boolean {
    const before = this.versions.length;
    this.versions = this.versions.filter((v) => v.id !== id);
    return this.versions.length !== before;
  }

  /** 저장한 순서대로 */
  list(): SavedVersion[] {
    return [...this.versions];
  }

  /** 저장한 버전이 없으면 빈 문자열. 파일에 버전 줄을 붙이지 않게 하기 위해서다. */
  toJson(): string {
    if (this.versions.length === 0) return '';
    return JSON.stringify(this.versions.map((v) => ({ ...v, timestamp: v.timestamp.toISOString() })));
  }

  /** 빈 문자열은 빈 목록, 구조가 틀리면 TypeError */
  static fromJson(json: string): SavedVersions {
    const saved = new SavedVersions();
    if (json === '') return saved;
    const data: unknown = JSON.parse(json);
    if (!Array.isArray(data) || !data.every(isStoredVersion)) throw new TypeError('Invalid saved versions');
    saved.versions = data.map((v) => ({ ...v, timestamp: new Date(v.timestamp) }));
    // 다음에 붙일 번호가 기존 id와 겹치지 않게 한다
    saved.count = Math.max(0, ...data.map((v) => Number(/^version-(\d+)$/.exec(v.id)?.[1] ?? 0)));
    return saved;
  }
}

interface StoredVersion {
  id: string;
  name: string;
  textState: string;
  metadataState: string;
  timestamp: string;
}

function isStoredVersion(value: unknown): value is StoredVersion {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.textState === 'string' &&
    typeof v.metadataState === 'string' &&
    typeof v.timestamp === 'string' &&
    !Number.isNaN(Date.parse(v.timestamp))
  );
}
