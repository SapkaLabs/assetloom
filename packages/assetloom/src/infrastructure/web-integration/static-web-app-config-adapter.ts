import { LoomError } from '../../domain/errors.js';
import type {
  JsonValue,
  StaticWebAppConfigIntegrationRecipe,
  StaticWebAppRoute,
} from '../../domain/catalog/planning.js';
import type {
  CatalogArtifactOutputResolver,
  IntegrationArtifactForAdapter,
  PreparedProjectIntegration,
  ProjectIntegrationAdapter,
  StoredIntegrationReceipt,
} from '../../application/execution/contracts.js';

export interface StaticWebAppIntegrationState {
  readonly routes: readonly StaticWebAppRoute[];
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return (
    typeof value === 'object' &&
    Object.values(value).every(isJsonValue)
  );
}

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function isObject(
  value: unknown,
): value is Readonly<Record<string, JsonValue>> {
  return isJsonValue(value) && !isJsonArray(value) && value !== null && typeof value === 'object';
}

function parse(content: string, destination: string): Readonly<Record<string, JsonValue>> {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isObject(parsed)) {
      throw new TypeError('The JSON root must be an object.');
    }
    return parsed;
  } catch (cause) {
    throw new LoomError({
      code: 'LOOM_WRITE_CONFLICT',
      message: 'Refusing to integrate an invalid static web app configuration.',
      cause,
      context: { destination },
    });
  }
}

function route(value: JsonValue): string | undefined {
  return isObject(value) && typeof value['route'] === 'string'
    ? value['route']
    : undefined;
}

function equal(left: JsonValue, right: StaticWebAppRoute): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function integrationState(
  value: JsonValue | undefined,
): StaticWebAppIntegrationState | undefined {
  if (!isObject(value) || !Array.isArray(value['routes'])) {
    return undefined;
  }
  const routes: StaticWebAppRoute[] = [];
  for (const item of value['routes']) {
    if (!isObject(item) || typeof item['route'] !== 'string' || !isObject(item['headers'])) {
      return undefined;
    }
    const headers: Record<string, string> = {};
    for (const [name, headerValue] of Object.entries(item['headers'])) {
      if (typeof headerValue !== 'string') {
        return undefined;
      }
      headers[name] = headerValue;
    }
    routes.push({ route: item['route'], headers });
  }
  return { routes };
}

function stateValue(state: StaticWebAppIntegrationState): JsonValue {
  return {
    routes: state.routes.map((item) => ({
      route: item.route,
      headers: { ...item.headers },
    })),
  };
}

function routeValue(item: StaticWebAppRoute): JsonValue {
  return { route: item.route, headers: { ...item.headers } };
}

export class StaticWebAppConfigIntegrationAdapter
  implements
    ProjectIntegrationAdapter<
      IntegrationArtifactForAdapter<'static-web-app-config'>
    >
{
  readonly adapter = 'static-web-app-config' as const;

  apply(
    content: string,
    recipe: StaticWebAppConfigIntegrationRecipe,
    previous: StaticWebAppIntegrationState | undefined,
    destination = 'static web app configuration',
  ): { readonly content: string; readonly state: StaticWebAppIntegrationState } {
    const current = parse(content, destination);
    const currentRoutes =
      current['routes'] !== undefined && isJsonArray(current['routes'])
      ? current['routes']
      : [];
    const desiredNames = new Set(recipe.routes.map((item) => item.route));
    const desiredByName = new Map(
      recipe.routes.map((item) => [item.route, item]),
    );
    const previousByName = new Map(
      (previous?.routes ?? []).map((item) => [item.route, item]),
    );

    for (const item of currentRoutes) {
      const name = route(item);
      if (name === undefined) {
        continue;
      }
      const previousRoute = previousByName.get(name);
      const desiredRoute = desiredByName.get(name);
      if (
        previousRoute !== undefined &&
        !equal(item, previousRoute) &&
        (desiredRoute === undefined || !equal(item, desiredRoute))
      ) {
        throw new LoomError({
          code: 'LOOM_WRITE_CONFLICT',
          message: 'Refusing to replace a modified static web app route.',
          context: { destination, route: name },
        });
      }
      if (
        previousRoute === undefined &&
        desiredRoute !== undefined &&
        !equal(item, desiredRoute)
      ) {
        throw new LoomError({
          code: 'LOOM_WRITE_CONFLICT',
          message: 'Refusing to replace an unowned static web app route.',
          context: { destination, route: name },
        });
      }
    }

    const retained = currentRoutes.filter((item) => {
      const name = route(item);
      return (
        name === undefined ||
        (!previousByName.has(name) && !desiredNames.has(name))
      );
    });
    const next: Record<string, JsonValue> = {
      ...current,
      routes: [...recipe.routes.map(routeValue), ...retained],
    };
    return {
      content: `${JSON.stringify(next, null, 2)}\n`,
      state: { routes: [...recipe.routes] },
    };
  }

  prepare(
    artifact: IntegrationArtifactForAdapter<'static-web-app-config'>,
    current: Uint8Array | undefined,
    previousState: JsonValue | undefined,
    outputs: CatalogArtifactOutputResolver,
  ): Promise<PreparedProjectIntegration> {
    void outputs;
    const previous = integrationState(previousState);
    if (previousState !== undefined && previous === undefined) {
      throw new LoomError({
        code: 'LOOM_WRITE_CONFLICT',
        message: 'Stored static web app integration state is invalid.',
        context: { taskId: artifact.id },
      });
    }
    const result = this.apply(
      current === undefined ? '{}\n' : Buffer.from(current).toString('utf8'),
      artifact.integration,
      previous,
      artifact.destination,
    );
    return Promise.resolve({
      content: Buffer.from(result.content, 'utf8'),
      state: stateValue(result.state),
    });
  }

  remove(
    receipt: StoredIntegrationReceipt,
    current: Uint8Array | undefined,
  ): Promise<Uint8Array | undefined> {
    if (current === undefined) {
      return Promise.resolve(undefined);
    }
    const previous = integrationState(receipt.state);
    if (previous === undefined) {
      throw new LoomError({
        code: 'LOOM_WRITE_CONFLICT',
        message: 'Stored static web app integration state is invalid.',
        context: { taskId: receipt.artifactId },
      });
    }
    const result = this.apply(
      Buffer.from(current).toString('utf8'),
      {
        adapter: 'static-web-app-config',
        stateKey: receipt.stateKey,
        routes: [],
      },
      previous,
      receipt.destination,
    );
    return Promise.resolve(Buffer.from(result.content, 'utf8'));
  }

  async verify(
    artifact: IntegrationArtifactForAdapter<'static-web-app-config'>,
    current: Uint8Array | undefined,
    receiptState: JsonValue,
    outputs: CatalogArtifactOutputResolver,
  ): Promise<void> {
    const prepared = await this.prepare(
      artifact,
      current,
      receiptState,
      outputs,
    );
    if (
      current === undefined ||
      !Buffer.from(prepared.content).equals(Buffer.from(current))
    ) {
      throw new LoomError({
        code: 'LOOM_VERIFY_FAILED',
        message: 'Managed static web app configuration differs from the generation plan.',
        context: { taskId: artifact.id, destination: artifact.destination },
      });
    }
  }
}
