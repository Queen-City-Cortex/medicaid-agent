import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkMastraLockfile, QUALIFIED_SKEW } from '../check-mastra-lockfile.mjs';

// Lockfile fragments: only the entries the check reads.
const lockfile = ({ core = '1.58.0', server = '1.45.0', deployer = server, clientCore = '1.45.0', agent = {}, extra = {} } = {}) => ({
  packages: {
    '': { name: 'nc-medicaid-navigator', devDependencies: { turbo: '^2.9.18' } },
    'packages/agent': {
      dependencies: { '@mastra/core': core, '@mastra/libsql': '1.14.0', ai: '^6.0.209', ...agent },
      devDependencies: { '@mastra/deployer': deployer, mastra: '1.15.0' },
    },
    'packages/web': { dependencies: { '@mastra/client-js': '1.26.0' } },
    'node_modules/@mastra/core': { version: core },
    'node_modules/@mastra/client-js': { version: '1.26.0', dependencies: { '@mastra/core': clientCore } },
    ...(clientCore === core ? {} : { 'node_modules/@mastra/client-js/node_modules/@mastra/core': { version: clientCore } }),
    'node_modules/@mastra/server': { version: server, dev: true },
    'node_modules/@mastra/deployer': { version: deployer, dev: true, dependencies: { '@mastra/server': server } },
    // Present in the real lockfile; a path under a core is not itself a core.
    'packages/agent/node_modules/@mastra/core/node_modules/@mastra/schema-compat': { version: '1.3.6' },
    ...extra,
  },
});
const rejects = (lock, pattern) => {
  const failures = checkMastraLockfile(lock);
  assert.ok(failures.some(failure => pattern.test(failure)), `expected ${pattern} in ${JSON.stringify(failures)}`);
};

test('accepts the repository lockfile', () => {
  const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
  assert.deepEqual(checkMastraLockfile(lock), []);
});
test('accepts the qualified pairing with the client-js nested core', () => {
  assert.deepEqual(checkMastraLockfile(lockfile({ core: QUALIFIED_SKEW.core, server: QUALIFIED_SKEW.httpLayer })), []);
});
test('accepts one release train with a deduplicated client core', () => {
  assert.deepEqual(checkMastraLockfile(lockfile({ core: '1.74.0', server: '1.74.0', clientCore: '1.74.0' })), []);
});
test('rejects a core bump over the old server and deployer (pull request #190)', () => {
  rejects(lockfile({ core: '1.72.0' }), /@mastra\/server 1\.45\.0 does not equal @mastra\/core 1\.72\.0/);
  rejects(lockfile({ core: '1.72.0' }), /@mastra\/deployer 1\.45\.0 does not equal @mastra\/core 1\.72\.0/);
});
test('rejects a server and deployer bump that leaves core behind', () => {
  rejects(lockfile({ server: '1.74.0' }), /@mastra\/server 1\.74\.0 does not equal @mastra\/core 1\.58\.0/);
});
test('rejects a deployer that differs from its server', () => {
  rejects(lockfile({ deployer: '1.58.0' }), /@mastra\/server 1\.45\.0 differs from @mastra\/deployer 1\.58\.0/);
});
test('rejects a second core private to a workspace', () => {
  rejects(
    lockfile({ core: '1.72.0', server: '1.72.0', extra: { 'packages/agent/node_modules/@mastra/core': { version: '1.58.0' } } }),
    /expected one @mastra\/core .* found .*packages\/agent\/node_modules\/@mastra\/core \(1\.58\.0\)/,
  );
});
test('rejects a nested client-js core that client-js does not ask for', () => {
  const lock = lockfile();
  lock.packages['node_modules/@mastra/client-js/node_modules/@mastra/core'].version = '1.50.0';
  rejects(lock, /expected one @mastra\/core/);
});
test('rejects a lockfile with no core, server or deployer', () => {
  const failures = checkMastraLockfile({ packages: {} });
  assert.equal(failures.length, 3);
});
test('rejects a duplicated server', () => {
  rejects(lockfile({ extra: { 'node_modules/mastra/node_modules/@mastra/server': { version: '1.45.0' } } }), /expected one @mastra\/server/);
});
for (const spec of ['^1.2.0', '~1.2.0', '>=1.2.0', '1.x', '*', 'latest']) {
  test(`rejects the range ${spec} on a Mastra package`, () => {
    rejects(lockfile({ agent: { '@mastra/loggers': spec } }), /packages\/agent: dependencies @mastra\/loggers is ".*"; pin an exact version/);
  });
}
test('rejects a caret on the mastra command-line tool', () => {
  const lock = lockfile();
  lock.packages['packages/agent'].devDependencies.mastra = '^1.15.0';
  rejects(lock, /devDependencies mastra is "\^1\.15\.0"/);
});
