import type {
  GenerationTask,
  LoadedConfiguration,
} from '../../domain/types.js';
import type { MaterializedOwnedOutput } from '../../storage/owned-output-lifecycle.js';
import type { UsageDescriptorV1 } from '../../domain/generation-result.js';

export interface PreparedNativeExecution {
  readonly ownedOutputs: readonly MaterializedOwnedOutput[];
  readonly usage: readonly UsageDescriptorV1[];
}

export interface NativeTaskExecutor {
  prepare(
    tasks: readonly GenerationTask[],
    loaded: LoadedConfiguration,
  ): Promise<PreparedNativeExecution>;
}
