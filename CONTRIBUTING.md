# 개발 규칙

## 시작하기

```bash
npm install
npm run dev        # 브라우저에서 확인
npm test           # 테스트
npm run typecheck  # 타입 검사
```

Node.js 22 이상이 필요합니다.

## 모듈과 폴더

설계서: [`docs/architecture.md`](docs/architecture.md)

| 모듈 | 폴더 | 내용 |
| --- | --- | --- |
| M1 파서·모델 | `src/domain/model`, `src/infrastructure/parser` | Mermaid 코드 → AbstractDiagram |
| M2 레이아웃 엔진 | `src/domain/layout` | 자동 배치 (elkjs). 고정 노드는 움직이지 않음 |
| M3 좌표 메타데이터 | `src/domain/metadata` | 좌표·고정 여부·수동 간선 경로 |
| M4 동기화·흐름 | `src/application` (Workspace, SyncManager, DiagramView) | 전체 연결, 통합 책임 |
| M5 화면 | `src/presentation` | 코드 편집기, 캔버스 |
| M6 저장·버전·내보내기 | `src/application` (VersionHistory, Snapshot), `src/infrastructure/file`, `src/infrastructure/export` | 파일, 실행취소, PNG·JPEG |

구현할 곳은 `todo('Mn')`으로 표시되어 있습니다. 자기 모듈의 `todo`를 채우면 됩니다.

## 지켜야 할 약속

1. **계층 규칙.** `presentation → application → infrastructure → domain` 방향으로만 import한다. `domain`은 다른 폴더를 import하지 않는다.
2. **공통 타입은 함부로 바꾸지 않는다.** `src/domain/**`의 타입과 `LayoutEngine`, `DiagramView` 인터페이스는 모든 모듈이 쓴다. 바꾸려면 PR에 그 타입을 쓰는 모듈 담당자를 리뷰어로 넣는다.
3. **마우스 조작은 Mermaid 코드를 바꾸지 않는다.** 좌표는 `LayoutMetadata`에만 쓴다.
4. **객체 생성은 코드로만.** 캔버스에서 노드·관계를 만들지 않는다.
5. **좌표 단위는 픽셀**(캔버스 100% 배율 기준)이다.
6. **좌표 저장 형식:** 파일 맨 끝 한 줄 `%% @umlmaid-layout {JSON}`

다른 모듈이 아직 없으면 `src/testing/fakes.ts`의 가짜 부품으로 먼저 연결해 본다.

## 브랜치와 PR

- `main`에는 직접 push할 수 없다. 브랜치를 만들어 PR로 합친다.
- 브랜치 이름: `m<번호>/<작업>` (예: `m2/pinned-layout`, `m5/canvas-drag`)
- PR은 **리뷰 1명 승인**과 **자동 검사(ci) 통과**가 있어야 합쳐진다.
- PR은 작게, 자주. 최소 일주일에 한 번은 `main`에 합친다. 마지막에 한꺼번에 합치지 않는다.
- PR 설명에 관련 요구사항 ID를 적는다 (예: `FR-04-2`).
