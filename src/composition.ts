// 담당: M4 동기화·흐름
// 앱 조립 지점. 모듈마다 진짜 부품과 가짜 부품 중 무엇을 쓸지 여기서만 정한다.
// 모듈이 완성되면 해당 줄을 진짜 부품으로 바꾼다. 다른 파일은 고치지 않아도 된다.
import { SyncManager } from './application/SyncManager';
import { VersionHistory } from './application/VersionHistory';
import { Workspace } from './application/Workspace';
import { LayoutEngineFactory } from './domain/layout/LayoutEngineFactory';
import { ImageExporter } from './infrastructure/export/ImageExporter';
import { FileManager } from './infrastructure/file/FileManager';
import { MermaidParser } from './infrastructure/parser/MermaidParser';

export function createWorkspace(): Workspace {
  const sync = new SyncManager(
    new MermaidParser(), // M1 진짜
    new LayoutEngineFactory(), // M2 진짜
    // M3 진짜: 세 번째 인자를 비우면 진짜 LayoutMetadata를 쓴다
  );
  return new Workspace(
    sync,
    new VersionHistory(), // M6 진짜
    new FileManager(), // M6 진짜
    new ImageExporter(), // M6 진짜
  );
}
