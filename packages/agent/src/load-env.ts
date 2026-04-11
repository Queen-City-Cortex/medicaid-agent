import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let processEnvLoaded = false;

function stripMatchingQuotes(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' || first === "'") && first === last) {
    const inner = value.slice(1, -1);
    if (first === '"') {
      return inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    return inner.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }
  return value;
}

export function parseEnvEntries(contents: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice('export '.length) : line;
    const separator = normalized.indexOf('=');
    if (separator <= 0) continue;

    const key = normalized.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = normalized.slice(separator + 1).trim();
    if (!(value.startsWith('"') || value.startsWith("'"))) {
      const commentIndex = value.search(/\s#/);
      if (commentIndex >= 0) {
        value = value.slice(0, commentIndex).trimEnd();
      }
    }

    entries.push([key, stripMatchingQuotes(value)]);
  }

  return entries;
}

export function loadEnvFiles(
  filePaths: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const loadedPaths: string[] = [];
  const protectedKeys = new Set(
    Object.entries(env)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key),
  );

  for (const filePath of new Set(filePaths.map((candidate) => path.resolve(candidate)))) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;

    for (const [key, value] of parseEnvEntries(fs.readFileSync(filePath, 'utf8'))) {
      if (protectedKeys.has(key)) continue;
      env[key] = value;
    }

    loadedPaths.push(filePath);
  }

  return loadedPaths;
}

export function defaultEnvFilePaths(cwd: string = process.cwd()): string[] {
  const packageDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const repoRoot = path.resolve(packageDir, '..', '..');

  return [
    path.join(repoRoot, '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(packageDir, '.env'),
    path.join(packageDir, '.env.local'),
    path.join(cwd, '.env'),
    path.join(cwd, '.env.local'),
  ];
}

export function loadAgentEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env === process.env && processEnvLoaded) return [];

  const loadedPaths = loadEnvFiles(defaultEnvFilePaths(), env);
  if (env === process.env) {
    processEnvLoaded = true;
  }
  return loadedPaths;
}

loadAgentEnv();
