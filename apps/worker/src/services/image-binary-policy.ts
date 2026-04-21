const MAX_IMAGE_BYTES = 2_500_000;

export type AllowedImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export type ImageBinaryInspection = Readonly<{
  mime: AllowedImageMime;
}>;

function readU32BE(buf: Uint8Array, offset: number): number {
  return (
    (((buf[offset] ?? 0) << 24) |
      ((buf[offset + 1] ?? 0) << 16) |
      ((buf[offset + 2] ?? 0) << 8) |
      (buf[offset + 3] ?? 0)) >>>
    0
  );
}

/** Sniff image type from magic bytes; throws on unknown or oversized payloads. */
export function inspectImageBinary(bytes: Uint8Array): ImageBinaryInspection {
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('image_too_large');
  }
  if (bytes.byteLength < 12) {
    throw new Error('image_too_small');
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg' };
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: 'image/png' };
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return { mime: 'image/gif' };
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: 'image/webp' };
  }
  throw new Error('image_unsupported_type');
}

export function assertDeclaredMimeMatchesSniff(declared: string, sniffed: AllowedImageMime): void {
  const d = declared.trim().toLowerCase();
  if (d !== sniffed) {
    throw new Error('image_mime_mismatch');
  }
}
