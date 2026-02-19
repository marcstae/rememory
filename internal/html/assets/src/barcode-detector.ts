// BarcodeDetector polyfill using @undecaf/zbar-wasm
// Provides offline QR code scanning without CDN dependencies
// Uses the inlined version which has WASM embedded as base64

import { scanImageData, type ZBarSymbol } from '@undecaf/zbar-wasm';

// Map zbar symbol types to BarcodeDetector format names
const FORMAT_MAP: Record<number, string> = {
  64: 'qr_code',    // ZBAR_QRCODE
  13: 'ean_13',     // ZBAR_EAN13
  8: 'ean_8',       // ZBAR_EAN8
  12: 'upc_a',      // ZBAR_UPCA
  9: 'upc_e',       // ZBAR_UPCE
  39: 'code_39',    // ZBAR_CODE39
  93: 'code_93',    // ZBAR_CODE93
  128: 'code_128',  // ZBAR_CODE128
  25: 'itf',        // ZBAR_I25
  38: 'codabar',    // ZBAR_CODABAR
};

export interface BarcodeDetectorOptions {
  formats?: string[];
}

export interface DetectedBarcode {
  format: string;
  rawValue: string;
  boundingBox: DOMRectReadOnly;
  cornerPoints: Array<{ x: number; y: number }>;
}

type ImageSource = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas | VideoFrame | Blob | ImageData;

export class BarcodeDetectorPolyfill {
  private formats: string[];

  constructor(options: BarcodeDetectorOptions = {}) {
    this.formats = options.formats || ['qr_code'];
  }

  static async getSupportedFormats(): Promise<string[]> {
    return ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39', 'code_93', 'code_128', 'itf', 'codabar'];
  }

  async detect(source: ImageSource): Promise<DetectedBarcode[]> {
    const imageData = await this.toImageData(source);
    if (!imageData || imageData.width === 0 || imageData.height === 0) {
      return [];
    }

    try {
      const symbols = await scanImageData(imageData);
      return symbols
        .map((symbol: ZBarSymbol) => this.toDetectedBarcode(symbol))
        .filter((barcode): barcode is DetectedBarcode =>
          barcode !== null && this.formats.includes(barcode.format)
        );
    } catch {
      return [];
    }
  }

  private async toImageData(source: ImageSource): Promise<ImageData | null> {
    // Handle ImageData directly
    if (source instanceof ImageData) {
      return source;
    }

    // Handle Blob/File
    if (source instanceof Blob) {
      const bitmap = await createImageBitmap(source);
      return this.drawToImageData(bitmap);
    }

    // Handle video, canvas, image elements
    return this.drawToImageData(source as CanvasImageSource);
  }

  private drawToImageData(source: CanvasImageSource): ImageData | null {
    let width: number;
    let height: number;

    if (source instanceof HTMLVideoElement) {
      width = source.videoWidth;
      height = source.videoHeight;
    } else if (source instanceof HTMLImageElement) {
      width = source.naturalWidth;
      height = source.naturalHeight;
    } else if (source instanceof HTMLCanvasElement || source instanceof OffscreenCanvas) {
      width = source.width;
      height = source.height;
    } else if (source instanceof ImageBitmap) {
      width = source.width;
      height = source.height;
    } else {
      return null;
    }

    if (width === 0 || height === 0) {
      return null;
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(source, 0, 0);
    return ctx.getImageData(0, 0, width, height);
  }

  private toDetectedBarcode(symbol: ZBarSymbol): DetectedBarcode | null {
    const format = FORMAT_MAP[symbol.type];
    if (!format) return null;

    const points = symbol.points;
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      format,
      rawValue: symbol.decode(),
      boundingBox: new DOMRectReadOnly(minX, minY, maxX - minX, maxY - minY),
      cornerPoints: points,
    };
  }
}

// Register polyfill globally if native BarcodeDetector is not available
export function registerPolyfill(): void {
  if (!('BarcodeDetector' in globalThis)) {
    (globalThis as any).BarcodeDetector = BarcodeDetectorPolyfill;
  }
}
