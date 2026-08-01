import {
  escapeAttribute,
  escapeHtml,
  humanize,
  renderOutputSummary,
} from './html.js';
import { renderGeneratedFileTree } from './file-tree.js';
import type { ReportModel, ReportResource } from './model.js';
import { renderAppIcon } from './templates/app-icon.js';
import { renderCatalogResource } from './templates/catalog-resource.js';
import { renderNotificationIcon } from './templates/notification-icon.js';
import { renderSplashScreen } from './templates/splash-screen.js';

function renderResource(resource: ReportResource): string {
  switch (resource.type) {
    case 'app-icon':
      return renderAppIcon(resource);
    case 'notification-icon':
      return renderNotificationIcon(resource);
    case 'splash-screen':
      return renderSplashScreen(resource);
    default:
      return renderCatalogResource(resource);
  }
}

function navigation(model: ReportModel): string {
  const resources = model.resources
    .map(
      (resource) => `
        <a href="#resource-${escapeAttribute(resource.id)}">
          <span class="nav-icon">${escapeHtml(resource.type === 'app-icon' ? '◆' : resource.type === 'notification-icon' ? '●' : '▣')}</span>
          <span>${escapeHtml(resource.title)}</span>
          ${resource.issues === 0 ? '<span class="nav-check">✓</span>' : `<span class="nav-issue">${resource.issues}</span>`}
        </a>`,
    )
    .join('');
  return `${resources}
    <a href="#generated-files">
      <span class="nav-icon">⌘</span>
      <span>Generated files</span>
      <span class="nav-check">${model.outputs}</span>
    </a>`;
}

function configurationFiles(model: ReportModel): string {
  return model.configurationFiles
    .map(
      (file, index) => `
        <li>
          <span class="file-order">${index + 1}</span>
          <code>${escapeHtml(file)}</code>
          ${index === model.configurationFiles.length - 1 ? '<span class="pill override">last override</span>' : ''}
        </li>`,
    )
    .join('');
}

const styles = `
:root {
  color-scheme: light;
  --ink: #14213d;
  --ink-soft: #46536b;
  --muted: #6f7c92;
  --line: #dfe5ee;
  --line-strong: #cad3e0;
  --paper: #ffffff;
  --canvas: #f4f7fb;
  --navy: #111b33;
  --navy-2: #1a2847;
  --teal: #087f75;
  --teal-light: #d9f5ef;
  --blue: #315ee7;
  --blue-light: #e7edff;
  --red: #bd2c3b;
  --red-light: #ffe9eb;
  --amber: #976500;
  --amber-light: #fff2cf;
  --shadow: 0 16px 42px rgba(22, 35, 59, .08);
  --shadow-soft: 0 6px 20px rgba(22, 35, 59, .06);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--canvas);
  color: var(--ink);
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.5;
}
button, input { font: inherit; }
code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
.layout { min-height: 100vh; }
.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: 270px;
  overflow-y: auto;
  padding: 28px 20px;
  color: #fff;
  background:
    radial-gradient(circle at 10% 0%, rgba(62, 207, 190, .16), transparent 30%),
    linear-gradient(168deg, var(--navy-2), var(--navy) 55%);
}
.brand { display: flex; align-items: center; gap: 12px; margin: 0 8px 34px; }
.brand-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid rgba(255,255,255,.17);
  border-radius: 12px;
  background: rgba(255,255,255,.08);
  box-shadow: inset 0 1px rgba(255,255,255,.12);
}
.brand-mark svg { width: 23px; height: 23px; }
.brand strong { display: block; font-size: 16px; letter-spacing: -.01em; }
.brand span { display: block; color: #aab7cc; font-size: 11px; letter-spacing: .09em; text-transform: uppercase; }
.nav-label { margin: 0 10px 10px; color: #8493ad; font-size: 10px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
.sidebar nav { display: grid; gap: 4px; }
.sidebar nav a {
  display: grid;
  grid-template-columns: 22px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 10px 11px;
  border-radius: 9px;
  color: #d6deea;
  text-decoration: none;
  transition: .15s ease;
}
.sidebar nav a:hover { color: #fff; background: rgba(255,255,255,.08); }
.nav-icon { color: #70d8cc; font-size: 11px; }
.nav-check { color: #70d8cc; }
.nav-issue {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 10px;
  color: #ffd8dc;
  background: rgba(255, 95, 111, .2);
  font-size: 11px;
  text-align: center;
}
.sidebar-meta {
  margin: 28px 8px 0;
  padding-top: 22px;
  border-top: 1px solid rgba(255,255,255,.1);
  color: #9caac0;
  font-size: 12px;
}
.sidebar-meta code { display: block; margin-top: 4px; color: #d6deea; font-size: 11px; }
.main { margin-left: 270px; min-width: 0; }
.hero {
  padding: 58px clamp(34px, 6vw, 84px) 54px;
  color: #fff;
  background:
    radial-gradient(circle at 80% 10%, rgba(49, 94, 231, .38), transparent 38%),
    radial-gradient(circle at 55% 110%, rgba(8, 127, 117, .32), transparent 36%),
    linear-gradient(135deg, #111b33, #1b2947);
}
.hero-top { display: flex; justify-content: space-between; gap: 32px; align-items: flex-start; }
.overline { margin: 0 0 12px; color: #83ded2; font-size: 11px; font-weight: 750; letter-spacing: .15em; text-transform: uppercase; }
.hero h1 { max-width: 820px; margin: 0; font-size: clamp(32px, 5vw, 58px); line-height: 1.02; letter-spacing: -.045em; }
.hero-description { max-width: 700px; margin: 20px 0 0; color: #bdc8d9; font-size: 16px; }
.hero-status {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 999px;
  background: rgba(255,255,255,.08);
  font-weight: 700;
  white-space: nowrap;
}
.hero-status.healthy { color: #a2f0e5; }
.hero-status.unhealthy { color: #ffc0c7; }
.hero-status .pulse { width: 8px; height: 8px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 5px color-mix(in srgb, currentColor 16%, transparent); }
.metrics { display: grid; grid-template-columns: repeat(4, minmax(110px, 1fr)); gap: 1px; margin-top: 46px; overflow: hidden; border: 1px solid rgba(255,255,255,.1); border-radius: 14px; background: rgba(255,255,255,.1); }
.metric { min-height: 90px; padding: 18px 20px; background: rgba(17, 27, 51, .58); backdrop-filter: blur(10px); }
.metric strong { display: block; font-size: 25px; letter-spacing: -.03em; }
.metric span { color: #aab7ca; font-size: 12px; }
.toolbar {
  position: sticky;
  z-index: 10;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 13px clamp(34px, 6vw, 84px);
  border-bottom: 1px solid var(--line);
  background: rgba(255,255,255,.92);
  backdrop-filter: blur(14px);
}
.toolbar-label { color: var(--muted); font-size: 12px; font-weight: 650; }
.filters { display: flex; gap: 6px; }
.filter {
  padding: 7px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--ink-soft);
  background: transparent;
  cursor: pointer;
}
.filter:hover { background: var(--canvas); }
.filter.active { border-color: #c9d4f7; color: #244bc3; background: var(--blue-light); font-weight: 700; }
.content { width: min(1280px, calc(100% - 68px)); margin: 0 auto; padding: 52px 0 88px; }
.overview-panel, .resource-section, .file-browser-section {
  margin-bottom: 28px;
  padding: clamp(24px, 4vw, 42px);
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--paper);
  box-shadow: var(--shadow);
}
.overview-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(300px, .8fr); gap: 38px; }
.eyebrow { margin: 0 0 5px; color: var(--teal); font-size: 10px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
h2, h3 { color: var(--ink); letter-spacing: -.025em; }
.overview-panel h2, .resource-heading h2, .file-browser-section h2 { margin: 0; font-size: 27px; }
.overview-copy { margin: 12px 0 0; color: var(--ink-soft); }
.fingerprint {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  margin-top: 20px;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--muted);
  background: var(--canvas);
  font-size: 11px;
}
.fingerprint code { color: var(--ink-soft); }
.config-files { margin: 0; padding: 0; list-style: none; }
.config-files li { display: grid; grid-template-columns: 26px minmax(0,1fr) auto; align-items: center; gap: 9px; padding: 9px 0; border-bottom: 1px solid var(--line); }
.config-files li:last-child { border-bottom: 0; }
.config-files code { overflow: hidden; color: var(--ink-soft); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.file-order { display: grid; width: 22px; height: 22px; place-items: center; border-radius: 50%; color: #fff; background: var(--navy-2); font-size: 10px; font-weight: 800; }
.pill { display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 999px; font-size: 9px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
.pill.override { color: #6d5006; background: var(--amber-light); }
.pill.neutral { color: #4f5c70; background: #edf1f6; }
.resource-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding-bottom: 25px; border-bottom: 1px solid var(--line); }
.heading-kicker { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
.resource-type { color: var(--teal); font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.platform { display: inline-flex; padding: 2px 7px; border-radius: 999px; font-size: 9px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
.platform-android { color: #0b6f5e; background: #dff5ed; }
.platform-ios { color: #284baa; background: #e8edff; }
.section-health { display: inline-flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 8px; font-size: 11px; font-weight: 750; }
.section-health span { display: grid; width: 17px; height: 17px; place-items: center; border-radius: 50%; color: #fff; font-size: 10px; }
.section-health.healthy { color: #087267; background: var(--teal-light); }
.section-health.healthy span { background: var(--teal); }
.section-health.unhealthy { color: var(--red); background: var(--red-light); }
.section-health.unhealthy span { background: var(--red); }
.showcase { margin-top: 30px; padding: 28px; border: 1px solid #dbe2ef; border-radius: 14px; background: linear-gradient(145deg, #f9fbfe, #f1f5fa); }
.showcase-heading, .subsection-heading { display: flex; justify-content: space-between; gap: 24px; align-items: flex-end; margin-bottom: 22px; }
.showcase-heading h3, .subsection-heading h3 { margin: 0; font-size: 19px; }
.showcase-heading > p { max-width: 370px; margin: 0; color: var(--muted); font-size: 12px; text-align: right; }
.context-grid { display: grid; gap: 18px; }
.icon-context-grid { grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); }
.context-item { min-width: 0; text-align: center; }
.context-item > strong, .splash-context > strong { display: block; margin-top: 10px; font-size: 12px; }
.context-item > span, .splash-context > span, .composer-context span { display: block; color: var(--muted); font-size: 10px; }
.icon-stage { display: grid; min-height: 154px; place-items: center; overflow: hidden; border: 1px solid rgba(22,35,59,.08); border-radius: 12px; background: #eef2f8; }
.android-stage { background: linear-gradient(145deg, #ecf7f2, #dcebe5); }
.ios-light-stage { background: linear-gradient(145deg, #fff, #e8edf4); }
.ios-dark-stage { background: linear-gradient(145deg, #253148, #0d1527); }
.ios-tinted-stage { background: linear-gradient(145deg, #e9e4ff, #c9bdf2); }
.monochrome-stage { background: linear-gradient(145deg, #353f50, #171e2b); }
.icon-result, .adaptive-result { display: grid; width: 86px; height: 86px; place-items: center; overflow: hidden; border-radius: 20px; box-shadow: 0 9px 18px rgba(14,24,44,.19); }
.icon-result img { width: 100%; height: 100%; object-fit: contain; }
.adaptive-result { position: relative; border-radius: 50%; background-position: center; background-size: cover; }
.adaptive-result img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.missing-mark { color: rgba(255,255,255,.8); font-size: 25px; }
.composer-context { grid-column: 1 / -1; display: flex; align-items: center; gap: 16px; padding: 20px; border: 1px solid var(--line); border-radius: 12px; text-align: left; background: #fff; }
.composer-glyph { display: grid; width: 58px; height: 58px; place-items: center; border-radius: 14px; color: #fff; background: linear-gradient(145deg, #5b71e8, #2746bc); font-family: monospace; font-weight: 800; }
.android-notification-preview { max-width: 560px; margin: 0 auto; }
.android-notification-shade { min-height: 280px; padding: 13px 16px 16px; overflow: hidden; border: 7px solid #1d2532; border-radius: 30px; color: #202124; background: linear-gradient(155deg, #d8e4fb, #e7edf7 58%, #d6e0f2); box-shadow: 0 22px 42px rgba(20,33,61,.2); font-family: Arial, sans-serif; }
.android-system-bar { display: flex; align-items: center; justify-content: space-between; min-height: 24px; padding: 0 6px; font-size: 10px; }
.android-system-left, .android-system-icons { display: flex; align-items: center; gap: 7px; }
.android-system-left strong { font-size: 10px; letter-spacing: .01em; }
.android-status-small-icon { display: grid; width: 13px; height: 13px; place-items: center; }
.android-status-small-icon img { width: 12px; height: 12px; object-fit: contain; filter: brightness(0); opacity: .72; }
.android-system-icons { gap: 6px; font-weight: 800; }
.android-signal { font-size: 6px; letter-spacing: -1px; }
.android-wifi { font-size: 12px; transform: rotate(180deg); }
.android-battery { position: relative; width: 16px; height: 8px; border: 1.4px solid #202124; border-radius: 2px; }
.android-battery::after { position: absolute; top: 2px; right: -3px; width: 2px; height: 4px; border-radius: 0 1px 1px 0; background: #202124; content: ''; }
.android-battery span { display: block; width: 75%; height: 100%; background: #202124; }
.android-shade-heading { display: flex; align-items: center; justify-content: space-between; padding: 17px 8px 12px; }
.android-shade-heading strong { font-size: 12px; font-weight: 650; }
.android-shade-heading span { display: grid; width: 27px; height: 27px; place-items: center; border-radius: 50%; background: rgba(255,255,255,.48); font-size: 11px; }
.android-notification-card { display: grid; grid-template-columns: 34px minmax(0,1fr) 28px; align-items: start; gap: 11px; padding: 15px 13px; border: 1px solid rgba(74,88,111,.1); border-radius: 21px; background: rgba(250,251,255,.94); box-shadow: 0 5px 13px rgba(56,69,91,.12); }
.android-notification-small-icon { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 8px; }
.android-notification-small-icon img { width: 20px; height: 20px; object-fit: contain; }
.android-notification-copy { min-width: 0; padding-top: 1px; }
.android-notification-app { display: flex; align-items: baseline; gap: 4px; min-width: 0; color: #59616e; }
.android-notification-app strong, .android-notification-app span { overflow: hidden; font-size: 10px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.android-notification-app span { color: #717986; font-weight: 500; }
.android-notification-title { display: block; overflow: hidden; margin-top: 5px; color: #202124; font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.android-notification-text { display: block; overflow: hidden; margin-top: 2px; color: #59616e; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.android-notification-expand { display: grid; width: 27px; height: 27px; place-items: center; border-radius: 50%; color: #59616e; background: rgba(228,233,243,.72); font-size: 14px; font-weight: 700; }
.android-shade-footer { display: flex; justify-content: flex-end; gap: 18px; padding: 19px 8px 0; color: #424a57; font-size: 9px; font-weight: 650; }
.android-notification-caption { margin: 13px 0 0; color: var(--muted); font-size: 9px; text-align: center; }
.splash-context-grid { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
.splash-context { text-align: center; }
.device-shell { width: 142px; margin: 0 auto; padding: 6px; border-radius: 27px; background: #101827; box-shadow: 0 15px 30px rgba(14,24,44,.22); }
.device-screen { position: relative; display: grid; height: 276px; place-items: center; overflow: hidden; border-radius: 22px; }
.device-sensor { position: absolute; top: 7px; left: 50%; width: 42px; height: 9px; border-radius: 8px; background: #111827; transform: translateX(-50%); }
.home-indicator { position: absolute; bottom: 7px; left: 50%; width: 42px; height: 3px; border-radius: 3px; background: rgba(40,50,65,.55); transform: translateX(-50%); }
.splash-art { width: 58%; }
.splash-art img { display: block; width: 100%; height: auto; }
.subsection { margin-top: 34px; }
.count { padding: 4px 9px; border-radius: 999px; color: var(--ink-soft); background: #eef2f7; font-size: 10px; font-weight: 800; }
.count-danger { color: var(--red); background: var(--red-light); }
.asset-grid { display: grid; gap: 14px; }
.source-grid { grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); }
.output-grid { grid-template-columns: repeat(auto-fill, minmax(225px, 1fr)); }
.asset-card { min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: #fff; box-shadow: var(--shadow-soft); }
.asset-preview { display: grid; min-height: 164px; max-height: 240px; place-items: center; overflow: hidden; border-bottom: 1px solid var(--line); background-color: #f5f7fa; }
.checkerboard { background-image: linear-gradient(45deg,#e9edf2 25%,transparent 25%),linear-gradient(-45deg,#e9edf2 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e9edf2 75%),linear-gradient(-45deg,transparent 75%,#e9edf2 75%); background-position: 0 0,0 8px,8px -8px,-8px 0; background-size: 16px 16px; }
.asset-preview img { display: block; max-width: 76%; max-height: 142px; object-fit: contain; filter: drop-shadow(0 6px 10px rgba(20,33,61,.12)); }
.source-card .asset-preview img { max-width: 84%; max-height: 150px; }
.asset-card-body { padding: 14px; }
.asset-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.asset-title-row strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.asset-path { display: block; overflow: hidden; margin-top: 7px; color: var(--muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.asset-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 10px; color: var(--muted); font-size: 9px; }
.output-summary { overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
.output-group { display: grid; grid-template-columns: 34px minmax(0,1fr) auto auto; align-items: center; gap: 12px; padding: 13px 15px; border-bottom: 1px solid var(--line); }
.output-group:last-child { border-bottom: 0; }
.output-group-icon { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 8px; color: var(--blue); background: var(--blue-light); font-size: 12px; }
.output-group-copy { min-width: 0; }
.output-group-copy strong { display: block; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.output-group-copy span { display: block; margin-top: 2px; color: var(--muted); font-size: 9px; }
.tree-jump { display: inline-flex; margin-top: 13px; color: var(--blue); font-size: 10px; font-weight: 750; text-decoration: none; }
.tree-jump:hover { text-decoration: underline; }
.status { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 5px; padding: 3px 6px; border-radius: 999px; font-size: 8px; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; }
.status-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.status-valid { color: #087267; background: var(--teal-light); }
.status-modified, .status-missing, .status-invalid { color: var(--red); background: var(--red-light); }
.status-untracked { color: var(--amber); background: var(--amber-light); }
.empty-preview { display: grid; min-height: 110px; place-items: center; color: var(--muted); background: #eef2f6; font-size: 10px; }
.empty-preview.compact { width: 100%; height: 100%; }
.code-preview { width: 100%; max-height: 240px; margin: 0; padding: 14px; overflow: auto; color: #cbd5e1; background: #172033; font-size: 8px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
.asset-details { margin-top: 12px; border-top: 1px solid var(--line); }
.asset-details summary { padding-top: 10px; color: var(--ink-soft); font-size: 9px; font-weight: 700; cursor: pointer; }
.asset-details dl { display: grid; gap: 5px; margin: 10px 0 0; font-size: 9px; }
.asset-details dl div { display: grid; grid-template-columns: 64px minmax(0,1fr); gap: 8px; }
.asset-details dt { color: var(--muted); }
.asset-details dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.empty-state { display: grid; justify-items: center; gap: 5px; padding: 38px 20px; border: 1px dashed var(--line-strong); border-radius: 12px; color: var(--muted); background: var(--canvas); text-align: center; }
.empty-state strong { color: var(--ink); }
.integration { margin-top: 28px; }
.file-browser-section { margin-top: 28px; }
.file-browser-description { max-width: 720px; margin: 9px 0 0; color: var(--ink-soft); font-size: 12px; }
.file-browser { display: grid; height: min(760px, calc(100vh - 64px)); min-height: 620px; grid-template-columns: minmax(280px, 36%) minmax(420px, 64%); margin-top: 28px; overflow: auto; border: 1px solid var(--line-strong); border-radius: 14px; background: #fff; }
.file-tree-pane, .file-inspector { display: flex; min-width: 0; min-height: 0; flex-direction: column; }
.file-tree-pane { border-right: 1px solid var(--line); background: #f7f9fc; }
.file-pane-heading { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 12px; min-height: 55px; padding: 10px 14px; border-bottom: 1px solid var(--line); background: #fff; }
.file-pane-heading span:first-child { min-width: 0; }
.file-pane-heading strong, .file-pane-heading small { display: block; }
.file-pane-heading strong { color: var(--ink); font-size: 11px; }
.file-pane-heading small { margin-top: 2px; color: var(--muted); font-size: 8px; }
.file-pane-count { display: grid; min-width: 24px; height: 24px; place-items: center; padding: 0 6px; border-radius: 999px; color: var(--blue); background: var(--blue-light); font-size: 8px; font-weight: 800; }
.file-tree { flex: 1 1 auto; padding: 15px 10px 18px; overflow: auto; background: #f7f9fc; }
.tree-directory > summary { display: grid; grid-template-columns: 14px 18px minmax(0,1fr) auto; align-items: center; gap: 5px; min-height: 29px; padding: 3px 7px; border-radius: 6px; color: var(--ink-soft); font-size: 10px; font-weight: 750; cursor: pointer; list-style: none; }
.tree-directory > summary::-webkit-details-marker { display: none; }
.tree-directory > summary:hover { background: #e9eef6; }
.tree-chevron { color: var(--muted); transition: transform .14s ease; }
.tree-directory[open] > summary .tree-chevron { transform: rotate(90deg); }
.folder-glyph { color: #7183a3; font-size: 10px; }
.tree-count { padding: 1px 6px; border-radius: 999px; color: var(--muted); background: #e8edf4; font-size: 8px; font-weight: 700; }
.tree-children { margin-left: 14px; padding-left: 6px; border-left: 1px solid #d7deea; }
.tree-file { display: grid; width: 100%; grid-template-columns: 18px minmax(0,1fr) 8px; align-items: center; gap: 5px; min-height: 29px; padding: 4px 7px; border: 0; border-radius: 6px; color: var(--ink-soft); background: transparent; text-align: left; cursor: pointer; }
.tree-file:hover { background: #e9eef6; }
.tree-file.active { color: #1e47bc; background: #dfe7ff; font-weight: 750; }
.file-glyph { color: #6b7c9a; font-size: 9px; text-align: center; }
.tree-file.active .file-glyph { color: var(--blue); }
.tree-filename { overflow: hidden; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.tree-file-status { width: 6px; height: 6px; border-radius: 50%; background: var(--teal); }
.tree-file-status-invalid, .tree-file-status-modified, .tree-file-status-missing { background: var(--red); }
.tree-file-status-untracked { background: #d08b00; }
.file-inspector { overflow: auto; background: #fff; }
.file-panel[hidden] { display: none; }
.file-panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 20px 22px; border-bottom: 1px solid var(--line); }
.file-panel-heading h3 { margin: 0; font-size: 18px; }
.file-panel-heading code { display: block; max-width: 620px; margin-top: 4px; overflow: hidden; color: var(--muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.file-preview { display: grid; min-height: 355px; max-height: 520px; place-items: center; overflow: auto; border-bottom: 1px solid var(--line); background-color: #f5f7fa; }
.file-preview > img { display: block; max-width: min(72%, 430px); max-height: 430px; object-fit: contain; filter: drop-shadow(0 13px 24px rgba(20,33,61,.15)); }
.file-preview .code-preview { max-height: 520px; min-height: 355px; padding: 22px; font-size: 10px; }
.file-preview .empty-preview { width: 100%; min-height: 355px; }
.file-metadata { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 0; margin: 0; padding: 14px 22px 24px; }
.file-metadata div { min-width: 0; padding: 9px 10px; border-bottom: 1px solid var(--line); }
.file-metadata dt { color: var(--muted); font-size: 8px; font-weight: 750; letter-spacing: .05em; text-transform: uppercase; }
.file-metadata dd { min-width: 0; margin: 3px 0 0; overflow-wrap: anywhere; color: var(--ink-soft); font-size: 9px; }
.file-metadata code { font-size: 8px; }
.configuration-details { margin-top: 28px; border: 1px solid var(--line); border-radius: 14px; background: #fff; box-shadow: var(--shadow-soft); }
.configuration-details > summary { padding: 18px 22px; color: var(--ink); font-weight: 750; cursor: pointer; }
.configuration-details pre { max-height: 560px; margin: 0; padding: 24px; overflow: auto; border-top: 1px solid var(--line); color: #cfd9e8; background: #111b2f; font-size: 11px; line-height: 1.55; }
.footer { padding: 20px 34px 44px; color: var(--muted); font-size: 10px; text-align: center; }
.filtered-out { display: none !important; }
@media (max-width: 940px) {
  .sidebar { position: static; width: auto; padding: 18px 22px; }
  .brand { margin-bottom: 14px; }
  .sidebar .nav-label, .sidebar-meta { display: none; }
  .sidebar nav { display: flex; overflow-x: auto; }
  .sidebar nav a { flex: 0 0 auto; }
  .main { margin-left: 0; }
  .hero { padding-top: 42px; }
  .file-browser { grid-template-columns: minmax(260px, 36%) minmax(400px, 64%); }
}
@media (max-width: 700px) {
  .hero-top, .resource-heading, .showcase-heading, .subsection-heading { align-items: flex-start; flex-direction: column; }
  .hero-status { align-self: flex-start; }
  .metrics { grid-template-columns: repeat(2, 1fr); }
  .toolbar { align-items: flex-start; flex-direction: column; }
  .content { width: min(100% - 28px, 1280px); padding-top: 24px; }
  .overview-grid { grid-template-columns: 1fr; }
  .showcase-heading > p { text-align: left; }
  .output-group { grid-template-columns: 30px minmax(0,1fr) auto; }
  .output-group > .platform { display: none; }
  .file-metadata { grid-template-columns: 1fr; }
}
@media print {
  .sidebar, .toolbar { display: none; }
  .main { margin: 0; }
  .hero { padding: 30px; background: #172033 !important; print-color-adjust: exact; }
  .content { width: 100%; padding: 20px; }
  .overview-panel, .resource-section { break-inside: avoid; box-shadow: none; }
  .file-browser { height: auto; overflow: visible; }
  .asset-card { break-inside: avoid; }
}`;

const script = `
const filters = document.querySelectorAll('[data-filter]');
const sections = document.querySelectorAll('.resource-section');
const outputGroups = document.querySelectorAll('.output-group');
const contextItems = document.querySelectorAll('[data-context-target]');
const treeFiles = document.querySelectorAll('[data-file-open]');
const filePanels = document.querySelectorAll('[data-file-panel]');
const fileInspector = document.querySelector('.file-inspector');
function selectFile(id) {
  for (const file of treeFiles) {
    const selected = file.dataset.fileOpen === id;
    file.classList.toggle('active', selected);
    file.setAttribute('aria-selected', selected ? 'true' : 'false');
  }
  for (const panel of filePanels) panel.hidden = panel.dataset.filePanel !== id;
  if (fileInspector !== null) fileInspector.scrollTop = 0;
}
for (const file of treeFiles) {
  file.addEventListener('click', () => selectFile(file.dataset.fileOpen));
}
for (const button of filters) {
  button.addEventListener('click', () => {
    const target = button.dataset.filter;
    for (const item of filters) item.classList.toggle('active', item === button);
    for (const section of sections) {
      section.classList.toggle('filtered-out', target !== 'all' && !section.dataset.targets.split(' ').includes(target));
    }
    for (const group of outputGroups) {
      group.classList.toggle('filtered-out', target !== 'all' && group.dataset.target !== target);
    }
    for (const item of contextItems) {
      item.classList.toggle('filtered-out', target !== 'all' && item.dataset.contextTarget !== target);
    }
    for (const file of treeFiles) {
      file.classList.toggle('filtered-out', target !== 'all' && file.dataset.target !== target);
    }
    const selected = [...treeFiles].find(file => file.classList.contains('active') && !file.classList.contains('filtered-out'));
    if (selected === undefined) {
      const next = [...treeFiles].find(file => !file.classList.contains('filtered-out'));
      if (next !== undefined) selectFile(next.dataset.fileOpen);
    }
  });
}`;

export function renderReportDocument(model: ReportModel): string {
  const healthy = model.issues === 0;
  const resources = model.resources.map(renderResource).join('');
  const allOutputs = [
    ...model.resources.flatMap((resource) => resource.outputs),
    ...model.integration.outputs,
  ];
  const integration =
    model.integration.outputs.length === 0
      ? ''
      : `
        <section class="overview-panel integration" id="project-integration">
          <div class="resource-heading">
            <div>
              <p class="eyebrow">Project wiring</p>
              <h2>Project integration</h2>
            </div>
            ${
              model.integration.issues === 0
                ? '<span class="section-health healthy"><span>✓</span> Integration files present</span>'
                : `<span class="section-health unhealthy"><span>!</span> ${model.integration.issues} issue${model.integration.issues === 1 ? '' : 's'}</span>`
            }
          </div>
          <div class="subsection">${renderOutputSummary(model.integration.outputs)}</div>
        </section>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <title>${escapeHtml(model.configurationName)} · Assetloom report</title>
  <style>${styles}</style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 4.5h14v5L12 14 5 9.5v-5Z" stroke="#78dfd2" stroke-width="1.6"/><path d="M5 10.5 12 15l7-4.5v5L12 20l-7-4.5v-5Z" stroke="#fff" stroke-width="1.6"/></svg>
        </span>
        <span><strong>Assetloom</strong><span>Generation report</span></span>
      </div>
      <p class="nav-label">Resources</p>
      <nav>${navigation(model)}</nav>
      <div class="sidebar-meta">
        Deterministic snapshot
        <code>${escapeHtml(model.fingerprint.slice(0, 16))}</code>
      </div>
    </aside>
    <main class="main">
      <header class="hero">
        <div class="hero-top">
          <div>
            <p class="overline">Asset generation quality report</p>
            <h1>${escapeHtml(model.configurationName)}</h1>
            <p class="hero-description">${escapeHtml(model.description ?? 'Source artwork and generated resources in one reviewable artifact.')}</p>
          </div>
          <div class="hero-status ${healthy ? 'healthy' : 'unhealthy'}">
            <span class="pulse"></span>
            ${healthy ? 'All outputs verified' : `${model.issues} issue${model.issues === 1 ? '' : 's'} found`}
          </div>
        </div>
        <div class="metrics">
          <div class="metric"><strong>${model.resources.length}</strong><span>Configured resources</span></div>
          <div class="metric"><strong>${model.sources}</strong><span>Unique source files</span></div>
          <div class="metric"><strong>${model.outputs}</strong><span>Outputs inspected</span></div>
          <div class="metric"><strong>${model.validOutputs}/${model.outputs}</strong><span>Outputs verified</span></div>
        </div>
      </header>
      <div class="toolbar">
        <span class="toolbar-label">Filter the report by target</span>
        <div class="filters" role="group" aria-label="Platform filter">
          <button class="filter active" type="button" data-filter="all">All platforms</button>
          ${model.targets.map((target) => `<button class="filter" type="button" data-filter="${escapeAttribute(target)}">${escapeHtml(humanize(target))}</button>`).join('')}
        </div>
      </div>
      <div class="content">
        <section class="overview-panel" id="overview">
          <div class="overview-grid">
            <div>
              <p class="eyebrow">Configuration identity</p>
              <h2>One report, one effective configuration</h2>
              <p class="overview-copy">The previews below embed the actual configured inputs and generated files present when this report was created. The report has no network or external-file dependencies and can be copied as a single HTML file.</p>
              <span class="fingerprint"><span>SHA-256</span><code>${escapeHtml(model.fingerprint)}</code></span>
            </div>
            <div>
              <p class="eyebrow">Merge order</p>
              <ol class="config-files">${configurationFiles(model)}</ol>
            </div>
          </div>
        </section>
        ${resources}
        ${integration}
        ${renderGeneratedFileTree(allOutputs)}
        <details class="configuration-details">
          <summary>View effective merged configuration</summary>
          <pre><code>${escapeHtml(model.effectiveConfiguration)}</code></pre>
        </details>
      </div>
      <footer class="footer">Generated by Assetloom · Native and catalog resources · Self-contained report</footer>
    </main>
  </div>
  <script>${script}</script>
</body>
</html>
`;
}
