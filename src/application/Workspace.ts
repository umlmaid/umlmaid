// 담당: M4 동기화·흐름
// «Facade» 화면(M5)은 이 클래스의 메서드만 부른다.
import type { Point } from '../domain/metadata/geometry';
import { ImageExporter, ImageFormat } from '../infrastructure/export/ImageExporter';
import { FileManager } from '../infrastructure/file/FileManager';
import { todo } from '../todo';
import { SyncManager } from './SyncManager';
import { VersionHistory } from './VersionHistory';

export class Workspace {
  readonly syncManager = new SyncManager();
  private readonly history = new VersionHistory();
  private readonly fileManager = new FileManager();
  private readonly imageExporter = new ImageExporter();

  editCode(text: string): Promise<void> {
    return todo('M4');
  }

  moveNode(nodeId: string, x: number, y: number): void {
    todo('M4');
  }

  updateEdgeRoute(edgeId: string, waypoints: Point[]): void {
    todo('M4');
  }

  unpinNode(nodeId: string): void {
    todo('M4');
  }

  undo(): Promise<void> {
    return todo('M4');
  }

  redo(): Promise<void> {
    return todo('M4');
  }

  saveProject(): Blob {
    return todo('M4');
  }

  loadProject(file: File): Promise<void> {
    return todo('M4');
  }

  exportToImage(canvasSvg: SVGSVGElement, format: ImageFormat): Promise<Blob> {
    return todo('M4');
  }
}
