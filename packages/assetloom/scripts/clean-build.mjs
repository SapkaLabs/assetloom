import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(packageRoot, 'lib');
if (path.dirname(output) !== packageRoot || path.basename(output) !== 'lib') {
  throw new Error(`Refusing to clean unexpected build output: ${output}`);
}
rmSync(output, { recursive: true, force: true });
