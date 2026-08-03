import path from 'node:path';
import { generate } from '@babel/generator';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as t from '@babel/types';
import { transform } from '@svgr/core';
import type { TransformSvgArtifact } from '../../domain/catalog/planning.js';
import type {
  SvgComponentNamingPolicy,
  SvgComponentOutput,
} from '../../domain/catalog/resources.js';
import type { ResolvedSource } from '../../domain/catalog/sources.js';
import { LoomError } from '../../domain/errors.js';
import { compareCodePoints } from '../../domain/ordering.js';

const traverseAst =
  typeof traverseModule === 'function'
    ? traverseModule
    : traverseModule.default;

export interface PlannedSvgComponentName {
  readonly relativePath: string;
  readonly componentName: string;
}

export interface SvgComponentPreset {
  readonly name: string;
  readonly version: string;
  planName(
    source: ResolvedSource,
    naming: SvgComponentOutput['naming'],
    componentNaming: SvgComponentNamingPolicy | undefined,
  ): PlannedSvgComponentName;
  transform(source: string, artifact: TransformSvgArtifact): string;
}

type CodePlugin = (code: string) => string;

function parseCode(code: string) {
  return parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
}

const removeXmlnsPlugin: CodePlugin = (code) =>
  code.replace(/xmlns="[^"]*"/g, '');

const nativeSizePropsPlugin: CodePlugin = (code) => {
  const ast = parseCode(code);
  traverseAst(ast, {
    JSXOpeningElement(elementPath) {
      const elementName = elementPath.node.name;
      if (
        t.isJSXIdentifier(elementName) &&
        elementName.name.toLowerCase() === 'svg'
      ) {
        elementPath.node.attributes.forEach((attribute) => {
          if (!t.isJSXAttribute(attribute) || !t.isJSXIdentifier(attribute.name)) {
            return;
          }
          const name = attribute.name.name.toLowerCase();
          if (name === 'width' || name === 'height') {
            attribute.value = t.jsxExpressionContainer(
              t.logicalExpression(
                '??',
                t.memberExpression(t.identifier('props'), t.identifier(name)),
                t.numericLiteral(24),
              ),
            );
          }
        });
      }
    },
  });
  return generate(ast, {}, code).code;
};

const domSizePropsPlugin: CodePlugin = (code) => {
  const ast = parseCode(code);
  traverseAst(ast, {
    JSXOpeningElement(elementPath) {
      if (!t.isJSXIdentifier(elementPath.node.name) || elementPath.node.name.name !== 'svg') {
        return;
      }
      elementPath.node.attributes.forEach((attribute) => {
        if (!t.isJSXAttribute(attribute) || !t.isJSXIdentifier(attribute.name)) {
          return;
        }
        if (attribute.name.name === 'width' || attribute.name.name === 'height') {
          attribute.value = t.jsxExpressionContainer(
            t.logicalExpression(
              '??',
              t.memberExpression(
                t.identifier('props'),
                t.identifier(attribute.name.name),
              ),
              t.numericLiteral(24),
            ),
          );
        }
      });
    },
  });
  return generate(ast, {}, code).code;
};

const nativeColorPropsPlugin: CodePlugin = (code) => {
  const ast = parseCode(code);
  traverseAst(ast, {
    JSXOpeningElement(elementPath) {
      elementPath.node.attributes.forEach((attribute) => {
        if (
          !t.isJSXAttribute(attribute) ||
          !t.isJSXIdentifier(attribute.name) ||
          !t.isStringLiteral(attribute.value)
        ) {
          return;
        }
        const name = attribute.name.name.toLowerCase();
        const value = attribute.value.value;
        if (
          (name === 'fill' || name === 'stroke') &&
          value.toLowerCase() !== 'none' &&
          value.toLowerCase().startsWith('#')
        ) {
          attribute.value = t.jsxExpressionContainer(
            t.logicalExpression(
              '??',
              t.memberExpression(t.identifier('props'), t.identifier('color')),
              t.stringLiteral(value),
            ),
          );
        }
      });
    },
  });
  return generate(ast, {}, code).code;
};

const domColorPropsPlugin: CodePlugin = (code) => {
  const ast = parseCode(code);
  traverseAst(ast, {
    JSXOpeningElement(elementPath) {
      elementPath.node.attributes.forEach((attribute) => {
        if (
          !t.isJSXAttribute(attribute) ||
          !t.isJSXIdentifier(attribute.name) ||
          !t.isStringLiteral(attribute.value)
        ) {
          return;
        }
        const name = attribute.name.name.toLowerCase();
        const value = attribute.value.value;
        if ((name === 'fill' || name === 'stroke') && value !== 'none') {
          attribute.value = t.jsxExpressionContainer(
            t.logicalExpression(
              '??',
              t.memberExpression(t.identifier('props'), t.identifier('color')),
              t.stringLiteral(value),
            ),
          );
        }
      });
    },
  });
  return generate(ast, {}, code).code;
};

const DOM_TAGS = [
  'svg',
  'path',
  'g',
  'rect',
  'circle',
  'line',
  'polyline',
  'polygon',
  'ellipse',
  'text',
  'defs',
  'symbol',
  'use',
  'image',
  'clipPath',
  'linearGradient',
  'radialGradient',
  'mask',
  'pattern',
] as const;

const CANONICAL_DOM_TAG_BY_LOWERCASE = new Map(
  DOM_TAGS.map((tag) => [tag.toLowerCase(), tag]),
);

const domTagNamesPlugin: CodePlugin = (code) => {
  const ast = parseCode(code);
  const canonicalize = (name: t.JSXIdentifier): void => {
    const candidate = CANONICAL_DOM_TAG_BY_LOWERCASE.get(
      name.name.toLowerCase(),
    );
    if (candidate !== undefined) {
      name.name = candidate;
    }
  };
  traverseAst(ast, {
    JSXOpeningElement(elementPath) {
      if (t.isJSXIdentifier(elementPath.node.name)) {
        canonicalize(elementPath.node.name);
      }
    },
    JSXClosingElement(elementPath) {
      if (t.isJSXIdentifier(elementPath.node.name)) {
        canonicalize(elementPath.node.name);
      }
    },
  });
  return generate(ast, {}, code).code;
};

function pascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9_$]+/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('');
}

function themedComponentName(
  source: ResolvedSource,
  naming: SvgComponentOutput['naming'],
  componentNaming: SvgComponentNamingPolicy | undefined,
): PlannedSvgComponentName {
  const sourceDirectory = path.posix.dirname(source.relativePath);
  const sourceBaseName = path.posix.basename(source.relativePath, '.svg');
  const outputBaseName =
    naming === 'pascal-case' ? pascalCase(sourceBaseName) : sourceBaseName;
  const parentDirectory = path.posix.basename(sourceDirectory);
  const componentName =
    componentNaming !== undefined &&
    parentDirectory.startsWith(componentNaming.parentDirectoryPrefix)
      ? `${parentDirectory}${componentNaming.separator}${outputBaseName}`
      : outputBaseName;
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(componentName)) {
    throw new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: 'SVG source does not produce a valid component identifier.',
      context: { source: source.relativePath, componentName },
    });
  }
  return {
    relativePath: path.posix.join(sourceDirectory, `${outputBaseName}.tsx`),
    componentName,
  };
}

const themedIconPreset: SvgComponentPreset = {
  name: 'themed-icon-v1',
  version: 'themed-icon-v1.0.1',
  planName: themedComponentName,
  transform(source, artifact) {
    const runtimePlugins: CodePlugin[] =
      artifact.runtime === 'react-native'
        ? [nativeSizePropsPlugin, nativeColorPropsPlugin]
        : [domSizePropsPlugin, domColorPropsPlugin, domTagNamesPlugin];
    const plugins = [
      '@svgr/plugin-svgo',
      '@svgr/plugin-jsx',
      removeXmlnsPlugin,
      ...runtimePlugins,
      '@svgr/plugin-prettier',
    ];
    const result = transform.sync(
      source,
      {
        native: artifact.runtime === 'react-native',
        icon: true,
        typescript: true,
        prettier: true,
        runtimeConfig: false,
        prettierConfig: {
          semi: false,
          trailingComma: 'all',
          singleQuote: true,
          printWidth: 100,
          tabWidth: 2,
          useTabs: false,
          jsxSingleQuote: false,
          bracketSameLine: false,
          jsxBracketSameLine: false,
          arrowParens: 'avoid',
          endOfLine: 'lf',
        },
        ...(artifact.runtime === 'react-dom'
          ? {
              svgoConfig: {
                plugins: [
                  'preset-default',
                  'removeUselessStrokeAndFill',
                  'removeScriptElement',
                  'removeUnknownsAndDefaults',
                  'cleanupIds',
                  'removeHiddenElems',
                  { name: 'removeDimensions' },
                ],
              },
            }
          : {}),
        plugins,
      },
      {
        componentName: artifact.componentName,
        caller: { name: '@svgr/cli', defaultPlugins: plugins },
      },
    );
    const header =
      artifact.runtime === 'react-native'
        ? "/* eslint-disable ts/ban-ts-comment */\n// @ts-nocheck - This file is generated and we don't want to fix all the issues in it, and even notice them.\n"
        : '/* This file is auto-generated. Do not modify it manually. */\n';
    return `${header}${result}`;
  },
};

export class SvgComponentPresetRegistry {
  readonly #presets: ReadonlyMap<string, SvgComponentPreset>;

  constructor(presets: readonly SvgComponentPreset[] = [themedIconPreset]) {
    this.#presets = new Map(presets.map((preset) => [preset.name, preset]));
  }

  get(name: string): SvgComponentPreset {
    const preset = this.#presets.get(name);
    if (preset === undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: `Unknown SVG component preset "${name}".`,
        context: {
          preset: name,
          supportedPresets: [...this.#presets.keys()].sort(compareCodePoints),
        },
      });
    }
    return preset;
  }
}
