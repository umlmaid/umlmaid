// 담당: M4 동기화·흐름
// «Facade» 화면(M5)은 이 클래스의 메서드만 부른다.
//
// 실행취소 기록 규칙(설계서 D-03):
//   - 드래그·간선 수정·고정 해제는 반영될 때마다 Snapshot 1개
//   - 코드는 입력이 CODE_SNAPSHOT_DELAY_MS 동안 멈췄을 때 Snapshot 1개 (한 글자마다 쌓지 않는다)
//   - 실행취소·다시실행 자체는 기록하지 않는다
import type { Point } from '../domain/metadata/geometry';
import { ImageExporter, ImageFormat } from '../infrastructure/export/ImageExporter';
import { FileManager } from '../infrastructure/file/FileManager';
import type { Snapshot } from './Snapshot';
import { SyncManager } from './SyncManager';
import { VersionHistory } from './VersionHistory';

export const CODE_SNAPSHOT_DELAY_MS = 500;

export class Workspace {
  private codeSnapshotTimer?: ReturnType<typeof setTimeout>;
  private snapshotCount = 0;

  constructor(
    readonly syncManager = new SyncManager(),
    private readonly history = new VersionHistory(),
    private readonly fileManager = new FileManager(),
    private readonly imageExporter = new ImageExporter(),
  ) {}

  /** 편집기 내용이 바뀔 때마다 부른다. 캔버스는 바로 갱신되고, 기록은 입력이 멈춘 뒤 남는다. */
  async editCode(text: string): Promise<void> {
    const applied = await this.syncManager.onTextChanged(text);
    if (!applied) return;
    clearTimeout(this.codeSnapshotTimer);
    this.codeSnapshotTimer = setTimeout(() => this.captureSnapshot(), CODE_SNAPSHOT_DELAY_MS);
  }

  async moveNode(nodeId: string, x: number, y: number): Promise<void> {
    this.flushPendingCodeSnapshot();
    if (await this.syncManager.onCanvasNodeMoved(nodeId, x, y)) this.captureSnapshot();
  }

  async updateEdgeRoute(edgeId: string, waypoints: Point[]): Promise<void> {
    this.flushPendingCodeSnapshot();
    if (await this.syncManager.onCanvasEdgeRouteChanged(edgeId, waypoints)) this.captureSnapshot();
  }

  async unpinNode(nodeId: string): Promise<void> {
    this.flushPendingCodeSnapshot();
    if (await this.syncManager.unpinNode(nodeId)) this.captureSnapshot();
  }

  async unpinAll(): Promise<void> {
    this.flushPendingCodeSnapshot();
    if (await this.syncManager.unpinAll()) this.captureSnapshot();
  }

  /** 실행취소·다시실행 버튼을 켤지 정할 때 쓴다 */
  get canUndo(): boolean {
    return this.codeSnapshotTimer !== undefined || this.history.canUndo();
  }

  get canRedo(): boolean {
    return this.codeSnapshotTimer === undefined && this.history.canRedo();
  }

  async undo(): Promise<void> {
    this.flushPendingCodeSnapshot();
    await this.restoreSnapshot(this.history.undo());
  }

  async redo(): Promise<void> {
    this.flushPendingCodeSnapshot();
    await this.restoreSnapshot(this.history.redo());
  }

  /** 문법 오류가 있어도 편집기에 있는 코드 그대로 저장한다 */
  saveProject(): Blob {
    return this.fileManager.save(this.syncManager.text, this.syncManager.metadata.toJson());
  }

  /** 다른 파일을 열면 이전 파일의 실행취소 기록은 버린다. 연 상태가 첫 기록이 된다. */
  async loadProject(file: File): Promise<void> {
    const data = await this.fileManager.load(file);
    clearTimeout(this.codeSnapshotTimer);
    this.codeSnapshotTimer = undefined;
    if (!(await this.syncManager.load(data.code, data.metadata))) return;
    this.history.reset();
    this.pushSnapshot(this.syncManager.text, this.syncManager.metadata.toJson());
  }

  exportToImage(canvasSvg: SVGSVGElement, format: ImageFormat): Promise<Blob> {
    return this.imageExporter.export(canvasSvg, format);
  }

  /** 코드 기록이 대기 중이면 다음 변경을 반영하기 전에 먼저 남긴다. 두 변경이 한 번에 되돌려지지 않게 하기 위해서다. */
  private flushPendingCodeSnapshot(): void {
    if (this.codeSnapshotTimer === undefined) return;
    clearTimeout(this.codeSnapshotTimer);
    this.codeSnapshotTimer = undefined;
    this.captureSnapshot();
  }

  private async restoreSnapshot(snapshot: Snapshot | undefined): Promise<void> {
    if (snapshot) await this.syncManager.restoreState(snapshot);
  }

  private captureSnapshot(): void {
    this.codeSnapshotTimer = undefined;
    // 첫 변경도 되돌릴 수 있게 빈 문서 상태를 맨 앞에 둔다
    if (this.snapshotCount === 0) this.pushSnapshot('', '');
    this.pushSnapshot(this.syncManager.text, this.syncManager.metadata.toJson());
  }

  private pushSnapshot(textState: string, metadataState: string): void {
    const snapshot: Snapshot = {
      id: `snapshot-${++this.snapshotCount}`,
      textState,
      metadataState,
      timestamp: new Date(),
    };
    this.history.push(snapshot);
  }
}
