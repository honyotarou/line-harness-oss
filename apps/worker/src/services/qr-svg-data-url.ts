import { encodeQR } from '@paulmillr/qr';

/** ~240px QR for landing HTML; no third-party image host (privacy / availability). */
const QR_SVG_OPTS = { scale: 8, border: 2, ecc: 'medium' as const };

export function qrPayloadToSvgDataUrl(payload: string): string {
  const svg = encodeQR(payload, 'svg', QR_SVG_OPTS);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
