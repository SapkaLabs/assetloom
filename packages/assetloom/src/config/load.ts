import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import { LoomError } from '../domain/errors.js';
import type {
  LoadedConfiguration,
  LoadedVersionedConfiguration,
  VersionedAssetloomConfiguration,
} from '../domain/types.js';
import { mergeConfigurations } from './merge.js';

function formatAjvError(error: ErrorObject): {
  jsonPointer: string;
  reason: string;
} {
  const property =
    error.keyword === 'required' &&
    typeof error.params['missingProperty'] === 'string'
      ? `/${error.params['missingProperty']
          .replaceAll('~', '~0')
          .replaceAll('/', '~1')}`
      : '';
  return {
    jsonPointer: `${error.instancePath}${property}` || '/',
    reason: error.message ?? 'The value is invalid.',
  };
}

async function parseConfigurationFile(
  file: string,
): Promise<Readonly<Record<string, unknown>>> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (cause) {
    throw new LoomError({
      code: 'LOOM_CFG_PARSE',
      message: 'Failed to read Assetloom configuration.',
      cause,
      context: { file },
    });
  }

  try {
    const parsed: unknown = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new TypeError('The configuration root must be a JSON object.');
    }
    return parsed as Readonly<Record<string, unknown>>;
  } catch (cause) {
    throw new LoomError({
      code: 'LOOM_CFG_PARSE',
      message: 'Failed to parse Assetloom configuration.',
      cause,
      context: { file },
    });
  }
}

async function loadSchema(): Promise<Record<string, unknown>> {
  const schemaUrl = new URL('../../schema/config.schema.json', import.meta.url);
  try {
    return JSON.parse(
      await readFile(schemaUrl, 'utf8'),
    ) as Record<string, unknown>;
  } catch (cause) {
    throw new LoomError({
      code: 'LOOM_INTERNAL',
      message: 'Failed to load the bundled Assetloom configuration schema.',
      cause,
    });
  }
}

export interface LoadConfigurationOptions {
  readonly cwd?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function validateSemanticRules(
  value: Record<string, unknown>,
  files: readonly string[],
  provenance: ReadonlyMap<string, { readonly file: string }>,
): void {
  const resources = value['resources'];
  if (!isRecord(resources)) {
    return;
  }
  for (const [resourceId, candidate] of Object.entries(resources)) {
    if (!isRecord(candidate)) {
      continue;
    }
    const android = candidate['android'];
    if (!isRecord(android)) {
      continue;
    }
    const adaptive = android['adaptive'];
    if (!isRecord(adaptive)) {
      continue;
    }
    const background = adaptive['background'];
    if (!isRecord(background)) {
      continue;
    }
    if ('color' in background && 'source' in background) {
      const jsonPointer = `/resources/${resourceId}/android/adaptive/background`;
      throw new LoomError({
        code: 'LOOM_CFG_VALIDATE',
        message: 'Invalid Assetloom configuration.',
        context: {
          file: provenance.get(jsonPointer)?.file ?? files.at(-1),
          jsonPointer,
          reason: 'Specify either "color" or "source", but not both.',
        },
      });
    }
  }
}

export async function loadVersionedConfiguration(
  configuredFiles: readonly string[],
  options: LoadConfigurationOptions = {},
): Promise<LoadedVersionedConfiguration> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const files = configuredFiles.map((file) => path.resolve(cwd, file));
  const values = await Promise.all(
    files.map(async (file) => ({
      file,
      value: await parseConfigurationFile(file),
    })),
  );
  const merged = mergeConfigurations(values);
  validateSemanticRules(merged.value, files, merged.provenance);

  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
  });
  const validate = ajv.compile(await loadSchema());
  if (!validate(merged.value)) {
    const validationError = validate.errors?.[0];
    if (validationError === undefined) {
      throw new LoomError({
        code: 'LOOM_CFG_VALIDATE',
        message: 'Invalid Assetloom configuration.',
      });
    }
    const detail = formatAjvError(validationError);
    const provenance = merged.provenance.get(detail.jsonPointer);
    throw new LoomError({
      code: 'LOOM_CFG_VALIDATE',
      message: 'Invalid Assetloom configuration.',
      context: {
        file: provenance?.file ?? files.at(-1),
        jsonPointer: detail.jsonPointer,
        reason: detail.reason,
      },
    });
  }

  // AJV is the runtime type boundary. Both schema variants are closed and
  // version-discriminated before the parsed value is exposed to callers.
  const config = merged.value as unknown as VersionedAssetloomConfiguration;
  const projectRoot = path.resolve(cwd, config.project.root);
  return {
    config,
    files,
    projectRoot,
    provenance: merged.provenance,
  };
}

export async function loadConfiguration(
  configuredFiles: readonly string[],
  options: LoadConfigurationOptions = {},
): Promise<LoadedConfiguration> {
  const loaded = await loadVersionedConfiguration(configuredFiles, options);
  if (loaded.config.schemaVersion !== 1) {
    throw new LoomError({
      code: 'LOOM_CFG_VALIDATE',
      message: 'Schema version 2 requires the catalog planning API.',
      context: {
        file: loaded.files.at(-1),
        jsonPointer: '/schemaVersion',
        reason: 'Use loadVersionedConfiguration for schema version 2.',
      },
    });
  }
  return { ...loaded, config: loaded.config };
}
