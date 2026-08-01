import type { CatalogReportModel } from './catalog-report-model.js';

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderCatalogReport(model: CatalogReportModel): string {
  const sections = model.resources
    .map(
      (resource) => `<section id="resource-${escapeHtml(resource.id)}">
        <header><div><small>${escapeHtml(resource.type)}</small><h2>${escapeHtml(resource.id)}</h2></div><span class="health ${resource.issues === 0 ? 'ok' : 'bad'}">${resource.issues === 0 ? 'Verified' : `${resource.issues} issues`}</span></header>
        <div class="artifacts">${resource.artifacts
          .map(
            (artifact) => `<article>
              <div class="row"><strong>${escapeHtml(artifact.operation)}</strong><span class="status ${artifact.status}">${escapeHtml(artifact.status)}</span></div>
              <code>${escapeHtml(artifact.destination)}</code>
              <dl><dt>Target</dt><dd>${escapeHtml(artifact.target)}</dd><dt>Ownership</dt><dd>${escapeHtml(artifact.ownership)}</dd><dt>Bytes</dt><dd>${escapeHtml(artifact.bytes ?? '—')}</dd><dt>SHA-256</dt><dd><code>${escapeHtml(artifact.actualSha256?.slice(0, 16) ?? '—')}</code></dd>${artifact.publicPath === undefined ? '' : `<dt>Public path</dt><dd><code>${escapeHtml(artifact.publicPath)}</code></dd>`}</dl>
            </article>`,
          )
          .join('')}</div>
      </section>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(model.configurationName)} · Assetloom catalog</title>
<style>
:root{color-scheme:light;--ink:#17223b;--muted:#68758c;--line:#dce3ed;--canvas:#f4f7fb;--brand:#1f5ccc;--ok:#087f5b;--bad:#b42336}*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:14px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}main{width:min(1180px,calc(100% - 40px));margin:auto;padding:44px 0 80px}.hero{padding:38px;border-radius:20px;color:white;background:linear-gradient(135deg,#111b33,#24447d);box-shadow:0 18px 44px #1e31511f}.hero h1{margin:4px 0 8px;font-size:38px}.hero p{margin:0;color:#c4d0e3}.metrics{display:flex;gap:28px;margin-top:28px}.metrics strong{font-size:24px}.metrics span{display:block;color:#afbdd2;font-size:11px}section{margin-top:24px;padding:28px;border:1px solid var(--line);border-radius:16px;background:white;box-shadow:0 8px 24px #1828440d}section header,.row{display:flex;align-items:center;justify-content:space-between;gap:18px}h2{margin:2px 0 0}small{color:var(--brand);font-weight:800;letter-spacing:.08em;text-transform:uppercase}.health,.status{padding:4px 9px;border-radius:999px;font-size:11px;font-weight:750;text-transform:capitalize}.ok,.valid{color:var(--ok);background:#dff7ec}.bad,.modified,.missing,.untracked{color:var(--bad);background:#ffe7ea}.artifacts{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-top:22px}.artifacts article{min-width:0;padding:17px;border:1px solid var(--line);border-radius:11px;background:#fbfcfe}.artifacts>article>code{display:block;overflow:hidden;margin:10px 0;color:var(--muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}dl{display:grid;grid-template-columns:auto 1fr;gap:5px 12px;margin:12px 0 0;font-size:11px}dt{color:var(--muted)}dd{min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis}details{margin-top:24px;padding:18px;border:1px solid var(--line);border-radius:12px;background:white}pre{overflow:auto;max-height:500px;padding:16px;background:#111827;color:#d7e2f4;border-radius:9px}@media(max-width:650px){.hero,section{padding:22px}.hero h1{font-size:29px}.metrics{flex-wrap:wrap}}
</style></head><body><main><header class="hero"><small>Configurable resource catalog</small><h1>${escapeHtml(model.configurationName)}</h1><p>Deterministic inventory for ${escapeHtml(model.targets.join(', ') || 'no selected targets')}</p><div class="metrics"><div><strong>${model.resources.length}</strong><span>Resources</span></div><div><strong>${model.outputs}</strong><span>Outputs and integrations</span></div><div><strong>${model.issues}</strong><span>Issues</span></div></div></header>${sections}<details><summary>Effective configuration</summary><pre><code>${escapeHtml(model.effectiveConfiguration)}</code></pre></details></main></body></html>\n`;
}
