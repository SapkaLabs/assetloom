import type {
  GenerationTask,
  LoadedConfiguration,
} from '../../domain/types.js';
import type { MaterializedOwnedOutput } from '../../storage/owned-output-lifecycle.js';
import type { PreparedProjectFileChange } from './project-integration-lifecycle.js';

export interface PreparedNativeExecution {
  readonly integrations: readonly PreparedProjectFileChange[];
  readonly ownedOutputs: readonly MaterializedOwnedOutput[];
}

export interface NativeTaskExecutor {
  prepare(
    tasks: readonly GenerationTask[],
    loaded: LoadedConfiguration,
  ): Promise<PreparedNativeExecution>;
}
