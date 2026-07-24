import heic2any from 'heic2any';

const HEIC_MIME = /image\/hei[cf]/i;
const HEIC_EXT = /\.hei[cf]$/i;

export const IPHONE_HEIC_ERROR =
  "Couldn't read this iPhone photo — set iPhone Settings→Camera→Formats to 'Most Compatible', or retry.";

export function isHeicFile(file: File): boolean {
  if (HEIC_MIME.test(file.type || '')) return true;
  return HEIC_EXT.test(file.name || '');
}

/**
 * Converts HEIC/HEIF → JPEG for upload. Other image types pass through unchanged.
 * iOS often sends an empty MIME type, so extension checks are required.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (!isHeicFile(file)) {
    return file;
  }

  try {
    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9,
    });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    if (!(blob instanceof Blob)) {
      throw new Error('empty conversion');
    }
    const base = (file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    throw new Error(IPHONE_HEIC_ERROR);
  }
}
