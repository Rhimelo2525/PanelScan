/**
 * Identifies an image by its actual leading bytes (its "magic number"), never
 * by the filename or the Content-Type header, both of which the client
 * controls. Only the formats the profile picture feature accepts are
 * recognised; anything else - a PDF, an EXE, a renamed script - returns null.
 * This is a cheap first gate; the authoritative check is that sharp can fully
 * decode the file (see modules/profilePicture).
 */
export type SupportedImageType = 'jpeg' | 'png' | 'webp';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const detectImageType = (buffer: Buffer): SupportedImageType | null => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  if (buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return 'png';
  }
  // WebP is a RIFF container: "RIFF" <4-byte size> "WEBP".
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
};

export const ALLOWED_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(['.jpg', '.jpeg', '.png', '.webp']);
