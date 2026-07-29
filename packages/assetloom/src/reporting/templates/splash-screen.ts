import type {
  SplashAppearance,
  SplashScreenResource,
  TargetPlatform,
} from '../../domain/types.js';
import {
  escapeAttribute,
  escapeHtml,
  findOutput,
  outputImage,
} from '../html.js';
import type { ReportOutput, ReportResource } from '../model.js';
import { renderResource } from './shared.js';

function splashDevice(
  appearance: 'light' | 'dark',
  target: TargetPlatform,
  details: SplashAppearance,
  output: ReportOutput | undefined,
): string {
  return `
    <div class="splash-context" data-context-target="${target}">
      <div class="device-shell">
        <div class="device-screen" style="background:${escapeAttribute(details.backgroundColor)}">
          <div class="device-sensor"></div>
          <div class="splash-art">${outputImage(output, 'splash-context-image')}</div>
          <div class="home-indicator"></div>
        </div>
      </div>
      <strong>${escapeHtml(target === 'android' ? 'Android' : 'iOS')} · ${escapeHtml(appearance)}</strong>
      <span>${escapeHtml(details.backgroundColor)} · ${details.imageWidth} logical px</span>
    </div>`;
}

export function renderSplashScreen(resource: ReportResource): string {
  const config = resource.config as SplashScreenResource;
  const devices: string[] = [];
  for (const target of resource.targets) {
    for (const appearance of ['light', 'dark'] as const) {
      const details = config[appearance];
      if (details === undefined) {
        continue;
      }
      const fragment =
        target === 'android'
          ? `:android:${appearance}:`
          : `:ios:${appearance}:`;
      devices.push(
        splashDevice(
          appearance,
          target,
          details,
          findOutput(resource.outputs, fragment, target),
        ),
      );
    }
  }
  const showcase = `
    <div class="showcase">
      <div class="showcase-heading">
        <div>
          <p class="eyebrow">Appearance review</p>
          <h3>Launch-screen contexts</h3>
        </div>
        <p>Light and dark outputs on representative device canvases.</p>
      </div>
      <div class="context-grid splash-context-grid">${devices.join('')}</div>
    </div>`;
  return renderResource(resource, showcase);
}
