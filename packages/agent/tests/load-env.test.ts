import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultEnvFilePaths, loadEnvFiles, parseEnvEntries } from '../src/load-env.js';

describe('load-env', () => {
  it('parses dotenv-style entries with comments and quotes', () => {
    const entries = parseEnvEntries(`
      # comment
      FOO=bar
      export BAR="quoted value"
      BAZ='single quoted'
      WITH_COMMENT=value # trailing comment
    `);

    expect(entries).toEqual([
      ['FOO', 'bar'],
      ['BAR', 'quoted value'],
      ['BAZ', 'single quoted'],
      ['WITH_COMMENT', 'value'],
    ]);
  });

  it('lets later dotenv files override earlier dotenv files without replacing shell env', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-env-'));
    const rootEnvPath = path.join(tempDir, 'root.env');
    const packageEnvPath = path.join(tempDir, 'package.env');

    fs.writeFileSync(rootEnvPath, 'FOO=root\nBAR=root-only\nOVERRIDE_ME=root\n');
    fs.writeFileSync(packageEnvPath, 'FOO=package\nBAZ=package-only\nOVERRIDE_ME=package\n');

    const env = {
      SHELL_ONLY: 'keep-me',
      OVERRIDE_ME: 'shell-wins',
    } as NodeJS.ProcessEnv;

    const loadedPaths = loadEnvFiles([rootEnvPath, packageEnvPath], env);

    expect(loadedPaths).toEqual([rootEnvPath, packageEnvPath]);
    expect(env.FOO).toBe('package');
    expect(env.BAR).toBe('root-only');
    expect(env.BAZ).toBe('package-only');
    expect(env.SHELL_ONLY).toBe('keep-me');
    expect(env.OVERRIDE_ME).toBe('shell-wins');
  });

  it('searches repo, package, and cwd env files', () => {
    const paths = defaultEnvFilePaths('/tmp/custom-cwd');

    expect(paths).toContain('/tmp/custom-cwd/.env');
    expect(paths).toContain('/tmp/custom-cwd/.env.local');
    expect(paths.some((value) => value.endsWith('/packages/agent/.env'))).toBe(true);
    expect(paths.some((value) => value.endsWith('/packages/agent/.env.local'))).toBe(true);
  });
});
