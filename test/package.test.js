import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Consume the package the way npm does.
 *
 * Every other test in this repo imports `../dist/index.js` by relative path,
 * which never touches the `exports` map or the `files` allowlist — the two
 * things a real consumer resolves through. A subpath missing from `exports`, a
 * `types` path pointing at a file that was never built, or a `files` list that
 * forgets `dist` all ship green under a relative import. The first witness
 * would be whoever runs `npm install`.
 *
 * So: pack the real tarball, unpack it as `node_modules/threadkit`, and import
 * it by bare specifier from outside the repo.
 */

const PUBLIC_API = [
  'afterEveryMessage',
  'canRead',
  'canSeeMessage',
  'canWrite',
  'compareMessages',
  'defaultRespondPolicy',
  'findParticipant',
  'isPending',
  'mergeMessages',
  'readersOf',
  'runAiTurn',
  'unreadCount',
  'unreadMessages',
  'unreadThreadCount',
  'visibilityWindow',
  'visibleMessages',
  'whenMentioned',
];

let workspace;
let installed;
let probe;

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'threadkit-pack-'));
  installed = join(workspace, 'node_modules', 'threadkit');
  mkdirSync(installed, { recursive: true });

  execFileSync('npm', ['pack', '--silent', '--pack-destination', workspace], {
    cwd: process.cwd(),
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const tarball = readdirSync(workspace).find((f) => f.endsWith('.tgz'));
  assert.ok(tarball, 'npm pack produced no tarball');

  execFileSync('tar', ['-xzf', join(workspace, tarball), '-C', installed, '--strip-components=1']);

  // Each probe records failure as a *value*, never a throw. A broken exports map
  // that crashes this hook would fail every assertion in the file at once and
  // bury which entry point actually broke.
  writeFileSync(
    join(workspace, 'probe.mjs'),
    [
      'const out = {};',
      'try { out.resolved = import.meta.resolve("threadkit"); } catch { out.resolved = null; }',
      'try { out.exports = Object.keys(await import("threadkit")).sort(); } catch { out.exports = null; }',
      'console.log(JSON.stringify(out));',
    ].join('\n'),
  );

  probe = JSON.parse(
    execFileSync('node', [join(workspace, 'probe.mjs')], {
      cwd: workspace,
      encoding: 'utf8',
    }),
  );
});

test('the package resolves from a consumer install', () => {
  assert.ok(probe.resolved, '"threadkit" did not resolve through its own exports map');
});

test('the entry point exposes its whole public API', () => {
  assert.ok(probe.exports, 'importing "threadkit" from a consumer install threw');
  for (const name of PUBLIC_API) {
    assert.ok(probe.exports.includes(name), `"${name}" is missing from the published entry point`);
  }
});

test('the type declarations it advertises are actually in the tarball', () => {
  const pkg = JSON.parse(
    execFileSync('node', ['-p', 'JSON.stringify(require("./package.json"))'], {
      cwd: installed,
      encoding: 'utf8',
    }),
  );
  const types = pkg.exports['.'].types;
  assert.ok(
    existsSync(join(installed, types)),
    `the package advertises types at ${types}, which is not in the tarball`,
  );
});

test('the tarball carries the documentation npm will render', () => {
  for (const file of ['README.md', 'LICENSE']) {
    assert.ok(existsSync(join(installed, file)), `${file} is missing from the tarball`);
  }
});
