import path from 'node:path';
import type { FontFaceDefinition, FontFormat } from '../../domain/catalog/resources.js';
import { compareCodePoints } from '../../domain/ordering.js';
import { portablePath } from '../shared/paths.js';

export interface ResolvedFontFace {
  readonly definition: FontFaceDefinition;
  readonly source: string;
  readonly destination: string;
  readonly format: FontFormat;
}

function cssString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function cssFormat(format: FontFormat): string {
  switch (format) {
    case 'ttf':
      return 'truetype';
    case 'otf':
      return 'opentype';
    case 'woff':
      return 'woff';
    case 'woff2':
      return 'woff2';
  }
}

export function fontStylesheet(
  stylesheetPath: string,
  faces: readonly ResolvedFontFace[],
): string {
  const sorted = [...faces].sort(
    (left, right) =>
      left.definition.weight - right.definition.weight ||
      compareCodePoints(left.definition.style, right.definition.style) ||
      compareCodePoints(left.definition.alias, right.definition.alias),
  );
  return `${sorted
    .map((face) => {
      let sourcePath = portablePath(
        path.relative(path.dirname(stylesheetPath), face.destination),
      );
      if (!sourcePath.startsWith('.')) {
        sourcePath = `./${sourcePath}`;
      }
      return [
        '@font-face {',
        `  font-family: '${cssString(face.definition.alias)}';`,
        `  src: url('${cssString(sourcePath)}') format('${cssFormat(face.format)}');`,
        `  font-style: ${face.definition.style};`,
        `  font-weight: ${face.definition.weight};`,
        '}',
      ].join('\n');
    })
    .join('\n\n')}\n`;
}
