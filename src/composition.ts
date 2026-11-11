// 담당: M4 동기화·흐름
// 앱 조립 지점. 모듈마다 진짜 부품과 가짜 부품 중 무엇을 쓸지 여기서만 정한다.
// 모듈이 완성되면 해당 줄을 진짜 부품으로 바꾼다. 다른 파일은 고치지 않아도 된다.
import { SyncManager } from './application/SyncManager';
import { Workspace } from './application/Workspace';
import { LayoutEngineFactory } from './domain/layout/LayoutEngineFactory';
import { ImageExporter } from './infrastructure/export/ImageExporter';
import { FileManager } from './infrastructure/file/FileManager';
import { MermaidParser } from './infrastructure/parser/MermaidParser';
import { InMemoryVersionHistory, inMemoryMetadataFactory } from './testing/fakes';

export function createWorkspace(): Workspace {
  const sync = new SyncManager(
    new MermaidParser(), // M1 진짜
    new LayoutEngineFactory(), // M2 진짜
    inMemoryMetadataFactory, // TODO(M3): 기본값(진짜 LayoutMetadata)을 쓰도록 이 인자를 지운다
  );
  return new Workspace(
    sync,
    new InMemoryVersionHistory(), // TODO(M6): new VersionHistory()
    new FileManager(), // M6 작업 전이라 저장·열기는 아직 오류가 난다
    new ImageExporter(), // M6 작업 전이라 내보내기는 아직 오류가 난다
  );
}
