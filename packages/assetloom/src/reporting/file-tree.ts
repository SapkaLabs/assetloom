import path from 'node:path';
import {
  escapeAttribute,
  escapeHtml,
  formatBytes,
  humanize,
  mediaPreview,
  statusBadge,
} from './html.js';
import type { ReportOutput } from './model.js';

interface TreeFile {
  readonly id: string;
  readonly output: ReportOutput;
}

interface TreeDirectory {
  readonly name: string;
  readonly directories: Map<string, TreeDirectory>;
  readonly files: TreeFile[];
}

function directory(name: string): TreeDirectory {
  return { name, directories: new Map(), files: [] };
}

function buildTree(files: readonly TreeFile[]): TreeDirectory {
  const root = directory('');
  for (const file of files) {
    const segments = file.output.path.split('/').filter(Boolean);
    const filename = segments.pop();
    if (filename === undefined) {
      continue;
    }
    let current = root;
    for (const segment of segments) {
      const existing = current.directories.get(segment);
      if (existing !== undefined) {
        current = existing;
      } else {
        const child = directory(segment);
        current.directories.set(segment, child);
        current = child;
      }
    }
    current.files.push(file);
  }
  return root;
}

function descendantCount(node: TreeDirectory): number {
  return (
    node.files.length +
    [...node.directories.values()].reduce(
      (total, child) => total + descendantCount(child),
      0,
    )
  );
}

function fileGlyph(output: ReportOutput): string {
  if (output.media?.kind === 'image') {
    return '◆';
  }
  if (output.media?.kind === 'text') {
    return '≡';
  }
  return '◇';
}

function renderTreeDirectory(node: TreeDirectory): string {
  const childDirectories = [...node.directories.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(
      (child) => `
        <details class="tree-directory" open>
          <summary>
            <span class="tree-chevron">›</span>
            <span class="folder-glyph">▰</span>
            <span>${escapeHtml(child.name)}</span>
            <span class="tree-count">${descendantCount(child)}</span>
          </summary>
          <div class="tree-children">${renderTreeDirectory(child)}</div>
        </details>`,
    )
    .join('');
  const childFiles = [...node.files]
    .sort((left, right) =>
      left.output.path.localeCompare(right.output.path),
    )
    .map(({ id, output }) => {
      const filename = path.posix.basename(output.path);
      return `
        <button class="tree-file${id === 'generated-file-0' ? ' active' : ''}" type="button" role="treeitem" aria-selected="${id === 'generated-file-0' ? 'true' : 'false'}" data-file-open="${escapeAttribute(id)}" data-target="${output.target}" title="${escapeAttribute(output.path)}">
          <span class="file-glyph">${fileGlyph(output)}</span>
          <span class="tree-filename">${escapeHtml(filename)}</span>
          <span class="tree-file-status tree-file-status-${output.status}" title="${escapeAttribute(humanize(output.status))}"></span>
        </button>`;
    })
    .join('');
  return `${childDirectories}${childFiles}`;
}

function detail(
  term: string,
  value: string,
  code = false,
): string {
  return `<div><dt>${escapeHtml(term)}</dt><dd>${code ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value)}</dd></div>`;
}

function outputDetails(output: ReportOutput): string {
  const actualDimensions =
    output.width === undefined || output.height === undefined
      ? '—'
      : `${output.width}×${output.height}`;
  const expectedDimensions =
    output.expectedWidth === undefined || output.expectedHeight === undefined
      ? '—'
      : `${output.expectedWidth}×${output.expectedHeight}`;
  return [
    detail('Platform', humanize(output.target)),
    detail('Operation', humanize(output.operation)),
    detail('Format', output.format ?? '—'),
    detail('Actual dimensions', actualDimensions),
    detail('Expected dimensions', expectedDimensions),
    detail(
      'Alpha channel',
      output.hasAlpha === undefined
        ? 'Not applicable'
        : output.hasAlpha
          ? 'Present'
          : 'None',
    ),
    detail('File size', formatBytes(output.bytes)),
    detail('Task', output.taskId, true),
    detail('Expected SHA-256', output.expectedSha256 ?? '—', true),
    detail('Actual SHA-256', output.actualSha256 ?? '—', true),
    detail(
      'Ownership',
      output.managed
        ? 'Assetloom managed'
        : 'Native project integration',
    ),
  ].join('');
}

function renderInspector(
  file: TreeFile,
  selected: boolean,
): string {
  const { output } = file;
  return `
    <article class="file-panel" data-file-panel="${escapeAttribute(file.id)}" data-target="${output.target}"${selected ? '' : ' hidden'}>
      <div class="file-panel-heading">
        <div>
          <p class="eyebrow">${escapeHtml(humanize(output.target))} · ${escapeHtml(humanize(output.operation))}</p>
          <h3>${escapeHtml(path.posix.basename(output.path))}</h3>
          <code title="${escapeAttribute(output.path)}">${escapeHtml(output.path)}</code>
        </div>
        ${statusBadge(output.status, output.managed)}
      </div>
      <div class="file-preview checkerboard">
        ${mediaPreview(output.media, output.label, 'file-preview-image')}
      </div>
      <dl class="file-metadata">${outputDetails(output)}</dl>
    </article>`;
}

export function renderGeneratedFileTree(
  outputs: readonly ReportOutput[],
): string {
  const files = [...outputs]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((output, index) => ({
      id: `generated-file-${index}`,
      output,
    }));
  if (files.length === 0) {
    return '';
  }
  const tree = buildTree(files);
  const issues = outputs.filter((output) => output.status !== 'valid').length;
  return `
    <section class="file-browser-section" id="generated-files">
      <div class="resource-heading">
        <div>
          <p class="eyebrow">Complete native inventory</p>
          <h2>Generated file browser</h2>
          <p class="file-browser-description">The visual sections above use one representative output per appearance. This tree contains every generated resolution and integration file. Select any file to inspect its embedded content and technical metadata.</p>
        </div>
        <span class="count ${issues > 0 ? 'count-danger' : ''}">${outputs.length} files${issues > 0 ? ` · ${issues} issues` : ''}</span>
      </div>
      <div class="file-browser">
        <div class="file-tree-pane">
          <div class="file-pane-heading">
            <span><strong>Generated files</strong><small>Browse the native output tree</small></span>
            <span class="file-pane-count">${outputs.length}</span>
          </div>
          <div class="file-tree" role="tree" aria-label="Generated files">
            ${renderTreeDirectory(tree)}
          </div>
        </div>
        <div class="file-inspector">
          <div class="file-pane-heading">
            <span><strong>Preview &amp; details</strong><small>Updates when a file is selected</small></span>
          </div>
          ${files.map((file, index) => renderInspector(file, index === 0)).join('')}
        </div>
      </div>
    </section>`;
}
