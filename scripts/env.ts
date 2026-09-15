import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/** Match local Next environment precedence without replacing shell-provided values. */
export function loadLabEnv() {
  for (const filename of ['.env.local', '.env']) {
    if (!existsSync(filename)) continue;
    const values = parseEnv(readFileSync(filename, 'utf8'));
    for (const [key, value] of Object.entries(values)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
