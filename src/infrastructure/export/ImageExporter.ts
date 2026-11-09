// 담당: M6 저장·버전·내보내기
// 화면에 보이는 그대로 내보낸다. 핀 아이콘·선택 표시 같은 편집용 표시는 빼야 한다(FR-09-8).
import { todo } from '../../todo';

export enum ImageFormat {
  PNG = 'PNG',
  JPEG = 'JPEG',
}

export class ImageExporter {
  /** canvasSvg: CanvasRenderer가 그린 SVG 요소 */
  export(canvasSvg: SVGSVGElement, format: ImageFormat, scale = 2): Promise<Blob> {
    return todo('M6');
  }
}
