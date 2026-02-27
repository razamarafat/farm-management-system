export interface CompressionOptions {
  maxSizeMB: number;
  maxWidthOrHeight: number;
  useWebWorker: boolean;
  initialQuality: number;
}

export interface CompressedFile {
  file: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  dataUrl: string;
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxSizeMB: 3,
  maxWidthOrHeight: 2048,
  useWebWorker: true,
  initialQuality: 0.8,
};

export async function compressImage(
  file: File,
  options: Partial<CompressionOptions> = {}
): Promise<CompressedFile> {
  const opts: CompressionOptions = {
    ...DEFAULT_OPTIONS,
    ...options
  };
  
  const originalSize = file.size;
  
  if (originalSize <= opts.maxSizeMB * 1024 * 1024) {
    const dataUrl = await fileToDataUrl(file);
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
      dataUrl,
    };
  }

  const imageBitmap = await createImageBitmap(file);
  
  const { width, height } = calculateDimensions(
    imageBitmap.width,
    imageBitmap.height,
    opts.maxWidthOrHeight
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }
  
  ctx.drawImage(imageBitmap, 0, 0, width, height);
  
  let quality = opts.initialQuality;
  let compressedFile: File = file;
  let dataUrl: string;
  
  do {
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.split(',')[1];
    const compressedSize = Math.round((base64.length * 3) / 4);
    
    if (compressedSize <= opts.maxSizeMB * 1024 * 1024 || quality <= 0.1) {
      const blob = await dataUrlToBlob(dataUrl);
      compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', {
        type: 'image/jpeg',
      });
      break;
    }
    
    quality -= 0.1;
  } while (quality > 0.1);
  
  const finalDataUrl = await fileToDataUrl(compressedFile);
  const finalSize = compressedFile.size;
  
  return {
    file: compressedFile,
    originalSize,
    compressedSize: finalSize,
    compressionRatio: originalSize / finalSize,
    dataUrl: finalDataUrl,
  };
}

function calculateDimensions(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  
  const ratio = width / height;
  
  if (width > height) {
    return {
      width: maxDimension,
      height: Math.round(maxDimension / ratio),
    };
  }
  
  return {
    width: Math.round(maxDimension * ratio),
    height: maxDimension,
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((res) => res.blob());
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 بایت';
  
  const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}

export function getFileExtension(filename: string): string {
  return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2);
}

export function generateUniqueFileName(prefix: string, extension: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}.${extension}`;
}

export const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'فرمت فایل پشتیبانی نمی‌شود. لطفاً تصویر با فرمت JPG، PNG یا WebP آپلود کنید.',
    };
  }
  
  const maxSize = 20 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'حجم فایل نباید بیشتر از 20 مگابایت باشد.',
    };
  }
  
  return { valid: true };
}
