// 담당: M6 저장·버전·내보내기
import { describe, expect, it } from 'vitest';
import { SavedVersions } from './SavedVersions';

describe('SavedVersions', () => {
  it('이름이 비어 있으면 "버전 N"으로 붙인다', () => {
    const v = new SavedVersions();
    expect(v.add('  ', 'a', '').name).toBe('버전 1');
    expect(v.add('초안', 'b', '').name).toBe('초안');
    expect(v.list().map((x) => x.textState)).toEqual(['a', 'b']);
  });

  it('지운 버전은 목록에서 빠지고, 없는 id는 false', () => {
    const v = new SavedVersions();
    const first = v.add('', 'a', '');
    expect(v.remove(first.id)).toBe(true);
    expect(v.remove(first.id)).toBe(false);
    expect(v.list()).toEqual([]);
  });

  it('JSON으로 저장했다가 읽으면 같은 버전이 나오고, 새 번호는 겹치지 않는다', () => {
    const v = new SavedVersions();
    v.add('초안', 'class A', '{"positions":{},"edgeRoutes":{}}', new Date('2026-11-25T01:00:00Z'));
    v.add('', 'class B', '');
    const back = SavedVersions.fromJson(v.toJson());
    expect(back.list()).toEqual(v.list());
    expect(back.add('', 'c', '').id).toBe('version-3');
  });

  it('버전이 없으면 빈 문자열, 빈 문자열은 빈 목록', () => {
    expect(new SavedVersions().toJson()).toBe('');
    expect(SavedVersions.fromJson('').list()).toEqual([]);
  });

  it('구조가 틀리면 TypeError', () => {
    expect(() => SavedVersions.fromJson('[{"id":1}]')).toThrow(TypeError);
    expect(() => SavedVersions.fromJson('{}')).toThrow(TypeError);
  });
});
