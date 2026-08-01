import { LoomError } from '../../domain/errors.js';
import { compareCodePoints } from '../../domain/ordering.js';

export interface WebBrandingPreset {
  readonly id: string;
  readonly version: string;
  createSocialOverlay(input: {
    readonly overlayPreset?: string;
    readonly displayName: string;
    readonly brandColor: string;
    readonly width: number;
    readonly height: number;
  }): string;
}

const PRODUCT_OVERVIEW_OVERLAY = 'product-overview-v1';

function escapeXmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replaceAll('"', '&quot;');
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function productOverviewOverlay(input: {
  readonly overlayPreset?: string;
  readonly displayName: string;
  readonly brandColor: string;
  readonly width: number;
  readonly height: number;
}): string {
  const overlayPreset = input.overlayPreset ?? PRODUCT_OVERVIEW_OVERLAY;
  if (overlayPreset !== PRODUCT_OVERVIEW_OVERLAY) {
    throw new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: `Unknown social preview overlay preset "${overlayPreset}".`,
      context: {
        overlayPreset,
        supportedPresets: [PRODUCT_OVERVIEW_OVERLAY],
      },
    });
  }
  const displayName = truncateText(input.displayName, 26);
  const fontSize = displayName.length > 18 ? 24 : 26;
  const length =
    displayName.length > 18
      ? ' textLength="278" lengthAdjust="spacingAndGlyphs"'
      : '';
  return `<svg width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}" xmlns="http://www.w3.org/2000/svg">
<rect x="0" y="0" width="${input.width}" height="${input.height}" fill="${escapeXmlAttribute(input.brandColor)}" opacity="0.12"/>
<rect x="48" y="32" width="400" height="76" rx="20" fill="#ffffff" opacity="0.94"/>
<rect x="0" y="${input.height - 36}" width="${input.width}" height="36" fill="${escapeXmlAttribute(input.brandColor)}" opacity="0.94"/>
<text x="132" y="66" fill="#111111" font-size="${fontSize}" font-weight="700" font-family="Arial, Helvetica, sans-serif"${length}>${escapeXmlText(displayName)}</text>
<text x="132" y="92" fill="#444444" font-size="17" font-weight="500" font-family="Arial, Helvetica, sans-serif">product overview</text>
</svg>`;
}

const PRESETS: Readonly<Record<string, WebBrandingPreset>> = {
  'web-app-branding-v1': {
    id: 'web-app-branding-v1',
    version: '1',
    createSocialOverlay: productOverviewOverlay,
  },
};

export function resolveWebBrandingPreset(id: string): WebBrandingPreset {
  const preset = PRESETS[id];
  if (preset === undefined) {
    throw new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: `Unknown web app branding preset "${id}".`,
      context: {
        preset: id,
        supportedPresets: Object.keys(PRESETS).sort(compareCodePoints),
      },
    });
  }
  return preset;
}
