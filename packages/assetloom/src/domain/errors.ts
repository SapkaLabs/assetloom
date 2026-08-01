export type LoomErrorCode =
  | 'LOOM_CFG_PARSE'
  | 'LOOM_CFG_MERGE'
  | 'LOOM_CFG_VALIDATE'
  | 'LOOM_CFG_PROVENANCE'
  | 'LOOM_CFG_PATH_INVALID'
  | 'LOOM_SRC_NOT_FOUND'
  | 'LOOM_SRC_INVALID'
  | 'LOOM_SRC_UNSUPPORTED'
  | 'LOOM_SRC_SECURITY_VIOLATION'
  | 'LOOM_PLAN_INVALID'
  | 'LOOM_PLAN_COLLISION'
  | 'LOOM_PLAN_TARGET_UNSUPPORTED'
  | 'LOOM_RENDER_FAILED'
  | 'LOOM_RENDER_TIMEOUT'
  | 'LOOM_RENDER_DIMENSION_INVALID'
  | 'LOOM_RENDER_FORMAT_UNSUPPORTED'
  | 'LOOM_CACHE_CORRUPT'
  | 'LOOM_CACHE_READ_FAILED'
  | 'LOOM_CACHE_WRITE_FAILED'
  | 'LOOM_STATE_PATH_UNSAFE'
  | 'LOOM_GENERATION_INTENT_INVALID'
  | 'LOOM_GENERATION_INTENT_WRITE_FAILED'
  | 'LOOM_GENERATION_RECOVERY_REQUIRED'
  | 'LOOM_LOCK_ACQUIRE_FAILED'
  | 'LOOM_LOCK_ALREADY_HELD'
  | 'LOOM_WRITE_FAILED'
  | 'LOOM_WRITE_CONFLICT'
  | 'LOOM_WRITE_OUTSIDE_ROOT'
  | 'LOOM_ATOMIC_PUBLISH_FAILED'
  | 'LOOM_MANIFEST_INVALID'
  | 'LOOM_MANIFEST_READ_FAILED'
  | 'LOOM_MANIFEST_WRITE_FAILED'
  | 'LOOM_GITIGNORE_FAILED'
  | 'LOOM_GITIGNORE_INVALID_BLOCK'
  | 'LOOM_GITIGNORE_VERIFICATION_FAILED'
  | 'LOOM_VERIFY_FAILED'
  | 'LOOM_VERIFY_IMAGE_INVALID'
  | 'LOOM_VERIFY_ANDROID_FAILED'
  | 'LOOM_VERIFY_IOS_FAILED'
  | 'LOOM_ANDROID_RESOURCE_INVALID'
  | 'LOOM_ANDROID_MANIFEST_UPDATE_FAILED'
  | 'LOOM_ANDROID_BUILD_VERIFICATION_FAILED'
  | 'LOOM_IOS_ASSET_CATALOG_INVALID'
  | 'LOOM_IOS_PROJECT_UPDATE_FAILED'
  | 'LOOM_IOS_BUILD_VERIFICATION_FAILED'
  | 'LOOM_CLEAN_UNOWNED_FILE'
  | 'LOOM_CLEAN_FAILED'
  | 'LOOM_CLI_USAGE'
  | 'LOOM_INTERNAL';

export interface LoomErrorOptions {
  code: LoomErrorCode;
  message: string;
  cause?: unknown;
  context?: Readonly<Record<string, unknown>>;
}

export class LoomError extends Error {
  readonly code: LoomErrorCode;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(options: LoomErrorOptions) {
    super(options.message, { cause: options.cause });

    this.name = 'LoomError';
    this.code = options.code;
    this.context = Object.freeze({ ...options.context });
  }
}

export function asLoomError(error: unknown): LoomError {
  if (error instanceof LoomError) {
    return error;
  }

  return new LoomError({
    code: 'LOOM_INTERNAL',
    message: 'An unexpected Assetloom failure occurred.',
    cause: error,
  });
}
