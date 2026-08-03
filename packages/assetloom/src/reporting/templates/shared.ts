import type { ReportResource } from '../model.js';
import {
  escapeAttribute,
  escapeHtml,
  humanize,
  renderOutputSection,
  renderSources,
} from '../html.js';

export function renderResource(
  resource: ReportResource,
  showcase: string,
): string {
  const targets = resource.targets
    .map(
      (target) =>
        `<span class="platform platform-${target}">${escapeHtml(humanize(target))}</span>`,
    )
    .join('');
  const status =
    resource.issues === 0
      ? '<span class="section-health healthy"><span>✓</span> All outputs verified</span>'
      : `<span class="section-health unhealthy"><span>!</span> ${resource.issues} issue${resource.issues === 1 ? '' : 's'}</span>`;
  return `
    <section class="resource-section" id="resource-${escapeAttribute(resource.id)}" data-targets="${escapeAttribute(resource.targets.join(' '))}">
      <div class="resource-heading">
        <div>
          <div class="heading-kicker">
            <span class="resource-type">${escapeHtml(humanize(resource.type))}</span>
            ${targets}
          </div>
          <h2>${escapeHtml(resource.title)}</h2>
        </div>
        ${status}
      </div>
      ${showcase}
      ${renderSources(resource.sources)}
      ${renderOutputSection(resource.outputs)}
    </section>`;
}
