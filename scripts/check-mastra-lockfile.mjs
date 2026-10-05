import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The one pairing in which the HTTP layer may differ from core. Core moved to 1.58.0 on 2026-10-02
// (d5a60a1) while the `mastra` command-line tool still selects the June server and deployer; this is
// the set the agent tests and builds qualify today. Delete this constant when issue #145 moves the
// family to one release train: from 1.58.0 onward upstream publishes core, server and deployer under
// the same version number, so plain equality then holds.
export const QUALIFIED_SKEW = { core: '1.58.0', httpLayer: '1.45.0' };

// @mastra/client-js declares its @mastra/core dependency as an exact version (1.26.0 -> core 1.45.0),
// so npm must nest a private core beside it whenever the agent's core differs. That copy is reached
// only by the web client, never by the agent process, and goes away when #145 picks the client-js
// release whose core equals the agent's. No other nested core is tolerated.
// The nested version must equal the exact version client-js declares; if client-js ever declares a
// range, the copy should have deduplicated and the check fails.
const CLIENT_JS = 'node_modules/@mastra/client-js';
const CLIENT_JS_CORE = `${CLIENT_JS}/node_modules/@mastra/core`;

const isMastra = name => name === 'mastra' || name.startsWith('@mastra/');
const isExact = spec => /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(spec);
const installed = (packages, name) =>
  Object.keys(packages).filter(path => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`));
const describe = (packages, paths) => paths.map(path => `${path} (${packages[path].version})`).join(', ') || 'none';

export function checkMastraLockfile(lock) {
  const packages = lock.packages ?? {};
  const failures = [];

  for (const [path, entry] of Object.entries(packages)) {
    if (path.includes('node_modules/')) continue;
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, spec] of Object.entries(entry[field] ?? {})) {
        if (isMastra(name) && !isExact(spec)) {
          failures.push(`${path || 'root'}: ${field} ${name} is "${spec}"; pin an exact version`);
        }
      }
    }
  }

  const cores = installed(packages, '@mastra/core').filter(path => {
    if (path !== CLIENT_JS_CORE) return true;
    return packages[path].version !== packages[CLIENT_JS]?.dependencies?.['@mastra/core'];
  });
  if (cores.length !== 1) {
    failures.push(`expected one @mastra/core outside the @mastra/client-js exemption, found ${describe(packages, cores)}`);
  }
  const core = cores.length === 1 ? packages[cores[0]].version : undefined;

  const versions = {};
  for (const name of ['@mastra/server', '@mastra/deployer']) {
    const paths = installed(packages, name);
    if (paths.length !== 1) failures.push(`expected one ${name}, found ${describe(packages, paths)}`);
    else versions[name] = packages[paths[0]].version;
  }
  const server = versions['@mastra/server'];
  const deployer = versions['@mastra/deployer'];
  if (server && deployer && server !== deployer) {
    failures.push(`@mastra/server ${server} differs from @mastra/deployer ${deployer}`);
  }
  for (const [name, version] of Object.entries(versions)) {
    const qualified = core === QUALIFIED_SKEW.core && version === QUALIFIED_SKEW.httpLayer;
    if (core && version !== core && !qualified) {
      failures.push(`${name} ${version} does not equal @mastra/core ${core}; move the family together (issue #145)`);
    }
  }
  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = checkMastraLockfile(JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')));
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('Mastra lockfile check passed; one @mastra/core, server and deployer in step, every Mastra spec exact.');
}
