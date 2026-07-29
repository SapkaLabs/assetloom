import type {
  ReportMedia,
  ReportOutput,
  ReportSource,
} from './model.js';

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeAttribute(value: unknown): string {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

export function humanize(value: string): string {
  const words = value
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll(/[-_.]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const vocabulary: Readonly<Record<string, string>> = {
    android: 'Android',
    ios: 'iOS',
    json: 'JSON',
    xml: 'XML',
    png: 'PNG',
    webp: 'WebP',
    mdpi: 'mdpi',
    hdpi: 'hdpi',
    xhdpi: 'xhdpi',
    xxhdpi: 'xxhdpi',
    xxxhdpi: 'xxxhdpi',
  };
  return words
    .map((word) => {
      const known = vocabulary[word.toLocaleLowerCase('en-US')];
      return (
        known ??
        `${word.slice(0, 1).toLocaleUpperCase('en-US')}${word.slice(1)}`
      );
    })
    .join(' ');
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined) {
    return 'Unavailable';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function shortHash(value?: string): string {
  return value === undefined ? '—' : value.slice(0, 12);
}

export function mediaPreview(
  media: ReportMedia | undefined,
  alt: string,
  className = '',
): string {
  if (media?.kind === 'image' && media.dataUrl !== undefined) {
    return `<img class="${escapeAttribute(className)}" src="${escapeAttribute(media.dataUrl)}" alt="${escapeAttribute(alt)}" loading="lazy">`;
  }
  if (media?.kind === 'text' && media.text !== undefined) {
    return `<pre class="code-preview"><code>${escapeHtml(media.text)}</code></pre>`;
  }
  return `<div class="empty-preview" aria-label="${escapeAttribute(alt)}"><span>Preview unavailable</span></div>`;
}

export function outputImage(
  output: ReportOutput | undefined,
  className = '',
): string {
  if (output === undefined) {
    return '<div class="empty-preview compact"><span>Missing output</span></div>';
  }
  return mediaPreview(output.media, output.label, className);
}

export function statusBadge(
  status: ReportOutput['status'],
  managed = true,
): string {
  const labels: Readonly<Record<ReportOutput['status'], string>> = {
    valid: managed ? 'Verified' : 'Present',
    modified: 'Modified',
    missing: 'Missing',
    untracked: 'Untracked',
    invalid: 'Invalid',
  };
  return `<span class="status status-${status}"><span class="status-dot"></span>${labels[status]}</span>`;
}

export function renderSources(sources: readonly ReportSource[]): string {
  if (sources.length === 0) {
    return '';
  }
  const cards = sources
    .map(
      (source) => `
        <article class="asset-card source-card">
          <div class="asset-preview checkerboard">
            ${mediaPreview(source.media, `Source ${source.name}`)}
          </div>
          <div class="asset-card-body">
            <div class="asset-title-row">
              <strong title="${escapeAttribute(source.path)}">${escapeHtml(source.name)}</strong>
              <span class="pill neutral">Input</span>
            </div>
            <code class="asset-path" title="${escapeAttribute(source.path)}">${escapeHtml(source.path)}</code>
            <div class="asset-meta">
              <span>${formatBytes(source.bytes)}</span>
              <span title="${escapeAttribute(source.sha256 ?? '')}">${shortHash(source.sha256)}</span>
            </div>
          </div>
        </article>`,
    )
    .join('');
  return `
    <div class="subsection">
      <div class="subsection-heading">
        <div>
          <p class="eyebrow">Configured artwork</p>
          <h3>Source inputs</h3>
        </div>
        <span class="count">${sources.length}</span>
      </div>
      <div class="asset-grid source-grid">${cards}</div>
    </div>`;
}

interface OutputGroup {
  readonly key: string;
  readonly outputs: readonly ReportOutput[];
}

function outputGroupKey(output: ReportOutput): string {
  return `${output.target}:${output.taskId.replace(
    /:(mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi|[123]x)$/i,
    '',
  )}`;
}

function outputGroups(outputs: readonly ReportOutput[]): OutputGroup[] {
  const grouped = new Map<string, ReportOutput[]>();
  for (const output of outputs) {
    const key = outputGroupKey(output);
    const group = grouped.get(key);
    if (group === undefined) {
      grouped.set(key, [output]);
    } else {
      group.push(output);
    }
  }
  return [...grouped.entries()].map(([key, groupedOutputs]) => ({
    key,
    outputs: groupedOutputs,
  }));
}

function groupStatus(outputs: readonly ReportOutput[]): ReportOutput['status'] {
  for (const status of [
    'invalid',
    'modified',
    'missing',
    'untracked',
  ] as const) {
    if (outputs.some((output) => output.status === status)) {
      return status;
    }
  }
  return 'valid';
}

function groupDimensions(outputs: readonly ReportOutput[]): string {
  const dimensions = outputs.flatMap((output) =>
    output.width === undefined || output.height === undefined
      ? []
      : [{ width: output.width, height: output.height }],
  );
  if (dimensions.length === 0) {
    return 'Structured resource';
  }
  const unique = new Set(
    dimensions.map(({ width, height }) => `${width}×${height}`),
  );
  if (unique.size === 1) {
    return [...unique][0] ?? 'Image';
  }
  const widths = dimensions.map(({ width }) => width);
  return `${Math.min(...widths)}–${Math.max(...widths)} px`;
}

function groupLabel(group: OutputGroup): string {
  const first = group.outputs[0];
  if (first === undefined) {
    return 'Generated files';
  }
  if (first.operation === 'copy' && group.outputs.length > 1) {
    return first.label.replace(/ · [^·]+$/, ' · Package contents');
  }
  const label = first.label.replace(
    / · (mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi|[123]x)$/i,
    '',
  );
  return label === humanize(first.target)
    ? `${label} · Density variants`
    : label;
}

export function renderOutputSummary(
  outputs: readonly ReportOutput[],
): string {
  if (outputs.length === 0) {
    return `
      <div class="empty-state">
        <strong>No generated outputs found</strong>
        <span>Run Assetloom generation for this configuration, then rebuild the report.</span>
      </div>`;
  }
  const groups = outputGroups(outputs);
  const rows = groups
    .map((group) => {
      const first = group.outputs[0];
      if (first === undefined) {
        return '';
      }
      const status = groupStatus(group.outputs);
      const formats = [
        ...new Set(
          group.outputs.flatMap((output) =>
            output.format === undefined ? [] : [humanize(output.format)],
          ),
        ),
      ].join(', ');
      return `
        <div class="output-group" data-target="${first.target}" data-status="${status}">
          <div class="output-group-icon">${group.outputs.some((output) => output.media?.kind === 'image') ? '▧' : '≡'}</div>
          <div class="output-group-copy">
            <strong>${escapeHtml(groupLabel(group))}</strong>
            <span>${group.outputs.length} file${group.outputs.length === 1 ? '' : 's'} · ${escapeHtml(groupDimensions(group.outputs))}${formats === '' ? '' : ` · ${escapeHtml(formats)}`}</span>
          </div>
          <span class="platform platform-${first.target}">${escapeHtml(humanize(first.target))}</span>
          ${statusBadge(status, group.outputs.every((output) => output.managed))}
        </div>`;
    })
    .join('');
  return `
    <div class="output-summary">${rows}</div>
    <a class="tree-jump" href="#generated-files">Browse and preview every generated file ↓</a>`;
}

export function renderOutputSection(outputs: readonly ReportOutput[]): string {
  const issues = outputs.filter((output) => output.status !== 'valid').length;
  return `
    <div class="subsection">
      <div class="subsection-heading">
        <div>
          <p class="eyebrow">Published native files</p>
          <h3>Generated outputs</h3>
        </div>
        <span class="count ${issues > 0 ? 'count-danger' : ''}">${outputs.length}${issues > 0 ? ` · ${issues} issue${issues === 1 ? '' : 's'}` : ''}</span>
      </div>
      ${renderOutputSummary(outputs)}
    </div>`;
}

export function findOutput(
  outputs: readonly ReportOutput[],
  fragment: string,
  target?: ReportOutput['target'],
): ReportOutput | undefined {
  const candidates = outputs.filter(
    (output) =>
      output.taskId.includes(fragment) &&
      (target === undefined || output.target === target) &&
      output.media?.kind === 'image',
  );
  return candidates.at(-1);
}
