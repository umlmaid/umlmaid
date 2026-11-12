// 담당: M6 저장·버전·내보내기
// 화면에 보이는 그대로 내보낸다. 핀 아이콘·선택 표시 같은 편집용 표시는 빼야 한다(FR-09-8).

export enum ImageFormat {
  PNG = 'PNG',
  JPEG = 'JPEG',
}

/**
 * 편집용 표시에 붙이는 표시. M5가 고정 해제 버튼 같은 요소에 이 속성을 붙이면 내보낼 때 빠진다.
 * (data-export-exclude="true")
 */
export const EXPORT_EXCLUDE_ATTRIBUTE = 'data-export-exclude';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** 브라우저가 만들 수 있는 캔버스 한 변의 안전한 한도. 넘으면 배율을 낮춘다. */
const MAX_CANVAS_SIDE = 16384;
/** 브라우저(특히 모바일·Safari)가 거부하는 캔버스 전체 넓이의 안전한 한도(픽셀 수) */
const MAX_CANVAS_AREA = 100_000_000;
const JPEG_QUALITY = 0.92;

export interface ExportSvg {
  /** XML 문자열로 직렬화한 SVG. 편집용 표시는 이미 빠져 있다. */
  markup: string;
  width: number;
  height: number;
}

/**
 * 화면의 SVG를 복사해 내보내기용으로 정리한다. 원본 SVG는 바꾸지 않는다.
 * - data-export-exclude 요소 제거
 * - 단독 이미지로 그려지도록 xmlns와 숫자 크기를 명시
 */
export function prepareSvgForExport(canvasSvg: SVGSVGElement): ExportSvg {
  // 다이어그램이 없을 때 CanvasRenderer는 비어 있는 <svg>를 그린다. 흰 이미지를 내보내지 않고 알려 준다.
  const hasContent = Array.from(canvasSvg.children).some((el) => el.tagName.toLowerCase() !== 'defs');
  if (!hasContent) throw new Error('내보낼 내용이 없습니다: 그려진 다이어그램이 없습니다');
  const { width, height } = measureSvg(canvasSvg);
  if (!(width > 0 && height > 0)) throw new Error('내보낼 내용이 없습니다: 캔버스 크기가 0입니다');

  const clone = canvasSvg.cloneNode(true) as SVGSVGElement;
  for (const el of Array.from(clone.querySelectorAll(`[${EXPORT_EXCLUDE_ATTRIBUTE}]`))) el.remove();
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  if (!clone.hasAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`);

  return { markup: new XMLSerializer().serializeToString(clone), width, height };
}

export class ImageExporter {
  /** canvasSvg: CanvasRenderer가 그린 SVG 요소 */
  async export(canvasSvg: SVGSVGElement, format: ImageFormat, scale = 2): Promise<Blob> {
    const { markup, width, height } = prepareSvgForExport(canvasSvg);
    const ratio = safeScale(width, height, scale);

    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const image = await loadImage(url);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('이미지를 그릴 수 없습니다: 2D 캔버스를 만들지 못했습니다');

      // 투명 배경이면 JPEG는 검게 나오고 PNG도 화면(흰 바탕)과 달라지므로 흰색으로 먼저 채운다
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      return await toBlob(canvas, format);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function measureSvg(svg: SVGSVGElement): { width: number; height: number } {
  // CanvasRenderer는 숫자 width/height를 쓰지만, 비어 있을 때는 width="100%"를 쓴다
  const attr = (name: string): number => {
    const raw = svg.getAttribute(name);
    return raw !== null && /^\s*[\d.]+(px)?\s*$/.test(raw) ? parseFloat(raw) : NaN;
  };
  let width = attr('width');
  let height = attr('height');
  if (!(width > 0 && height > 0) && svg.viewBox?.baseVal?.width > 0) {
    width = svg.viewBox.baseVal.width;
    height = svg.viewBox.baseVal.height;
  }
  if (!(width > 0 && height > 0)) {
    const rect = svg.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
  }
  return { width, height };
}

/** 한 변과 전체 넓이가 한도를 넘지 않게 배율을 낮춘다 */
function safeScale(width: number, height: number, scale: number): number {
  const wanted = scale > 0 && Number.isFinite(scale) ? scale : 1;
  const bySide = MAX_CANVAS_SIDE / Math.max(width, height);
  const byArea = Math.sqrt(MAX_CANVAS_AREA / (width * height));
  return Math.min(wanted, bySide, byArea);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이미지를 만들지 못했습니다: SVG를 읽을 수 없습니다'));
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, format: ImageFormat): Promise<Blob> {
  const mime = format === ImageFormat.JPEG ? 'image/jpeg' : 'image/png';
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지를 만들지 못했습니다: 캔버스가 너무 크거나 비어 있습니다'))),
      mime,
      format === ImageFormat.JPEG ? JPEG_QUALITY : undefined,
    );
  });
}
