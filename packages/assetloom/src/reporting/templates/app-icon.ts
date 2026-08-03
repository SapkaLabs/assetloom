import type { AppIconResource } from '../../domain/types.js';
import {
  escapeAttribute,
  escapeHtml,
  findOutput,
  outputImage,
} from '../html.js';
import type { ReportOutput, ReportResource } from '../model.js';
import { renderResource } from './shared.js';

function resultTile(
  title: string,
  subtitle: string,
  output: ReportOutput | undefined,
  className: string,
  target: 'android' | 'ios',
): string {
  return `
    <div class="context-item" data-context-target="${target}">
      <div class="icon-stage ${escapeAttribute(className)}">
        <div class="icon-result">${outputImage(output, 'context-image')}</div>
      </div>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(subtitle)}</span>
    </div>`;
}

function adaptiveTile(
  resource: ReportResource,
  config: AppIconResource,
): string {
  const foreground = findOutput(
    resource.outputs,
    ':adaptive-foreground:',
    'android',
  );
  const generatedBackground = findOutput(
    resource.outputs,
    ':adaptive-background:',
    'android',
  );
  const color =
    config.android?.adaptive?.background !== undefined &&
    'color' in config.android.adaptive.background
      ? config.android.adaptive.background.color
      : '#172033';
  const background =
    generatedBackground?.media?.kind === 'image' &&
    generatedBackground.media.dataUrl !== undefined
      ? `background-image:url('${escapeAttribute(generatedBackground.media.dataUrl)}')`
      : `background-color:${escapeAttribute(color)}`;
  return `
    <div class="context-item" data-context-target="android">
      <div class="icon-stage android-stage">
        <div class="adaptive-result" style="${background}">
          ${foreground === undefined ? '<span class="missing-mark">?</span>' : outputImage(foreground, 'adaptive-foreground')}
        </div>
      </div>
      <strong>Adaptive</strong>
      <span>Composed foreground + background</span>
    </div>`;
}

export function renderAppIcon(resource: ReportResource): string {
  const config = resource.config as AppIconResource;
  const legacy =
    findOutput(resource.outputs, ':legacy:', 'android') ??
    findOutput(resource.outputs, ':round:', 'android');
  const monochrome = findOutput(
    resource.outputs,
    ':adaptive-monochrome:',
    'android',
  );
  const iosLight = findOutput(resource.outputs, ':ios:light', 'ios');
  const iosDark = findOutput(resource.outputs, ':ios:dark', 'ios');
  const iosTinted = findOutput(resource.outputs, ':ios:tinted', 'ios');

  const tiles: string[] = [];
  if (config.android !== undefined) {
    tiles.push(
      resultTile(
        'Legacy',
        'Android launcher',
        legacy,
        'android-stage',
        'android',
      ),
    );
    if (config.android.adaptive !== undefined) {
      tiles.push(adaptiveTile(resource, config));
    }
    if (config.android.adaptive?.monochrome !== undefined) {
      tiles.push(
        resultTile(
          'Monochrome',
          'Android themed icon',
          monochrome,
          'monochrome-stage',
          'android',
        ),
      );
    }
  }
  if (config.ios?.mode === 'variants') {
    tiles.push(
      resultTile(
        'Light',
        'iOS appearance',
        iosLight,
        'ios-light-stage',
        'ios',
      ),
    );
    if (config.ios.dark !== undefined) {
      tiles.push(
        resultTile(
          'Dark',
          'iOS appearance',
          iosDark,
          'ios-dark-stage',
          'ios',
        ),
      );
    }
    if (config.ios.tinted !== undefined) {
      tiles.push(
        resultTile(
          'Tinted',
          'iOS appearance',
          iosTinted,
          'ios-tinted-stage',
          'ios',
        ),
      );
    }
  }
  if (config.ios?.mode === 'icon-composer') {
    tiles.push(`
      <div class="composer-context" data-context-target="ios">
        <div class="composer-glyph">.icon</div>
        <div>
          <strong>Icon Composer package</strong>
          <span>${escapeHtml(config.ios.name ?? 'AppIcon')}.icon is copied as an opaque native asset.</span>
        </div>
      </div>`);
  }

  const showcase = `
    <div class="showcase">
      <div class="showcase-heading">
        <div>
          <p class="eyebrow">Appearance review</p>
          <h3>Platform contexts</h3>
        </div>
        <p>Representative generated outputs, enlarged for visual inspection.</p>
      </div>
      <div class="context-grid icon-context-grid">${tiles.join('')}</div>
    </div>`;
  return renderResource(resource, showcase);
}
