#!/usr/bin/env node
'use strict';

/**
 * chat-migrate — applies the SDK's own Prisma schema to the dedicated chat
 * database.
 *
 * The SDK bundles its Prisma 7 schema and migrations so a host application can
 * set up the 11 chat tables without its own Prisma version interfering.
 *
 * Prisma 7 reads the datasource URL exclusively from a config file — there is
 * no --url flag — and prisma.config.ts is not part of the published package.
 * So we generate a throwaway CommonJS config in the system temp directory,
 * pointing at the schema and migrations that ship inside node_modules, and
 * hand it to the Prisma CLI via --config.
 */

const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');

/**
 * Resolve the Prisma CLI entrypoint. The package exports no requirable main,
 * so we go through its package.json and the "bin" it declares.
 */
function resolvePrismaCli() {
  const manifestPath = require.resolve('prisma/package.json');
  const manifest = require(manifestPath);
  const relative = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin.prisma;
  return join(dirname(manifestPath), relative);
}

const COMMANDS = {
  deploy: ['migrate', 'deploy'],
  dev: ['migrate', 'dev'],
  status: ['migrate', 'status'],
  studio: ['studio'],
};

const DEFAULT_COMMAND = 'deploy';

function fail(message) {
  console.error(`chat-migrate: ${message}`);
  process.exit(1);
}

const [command = DEFAULT_COMMAND, ...rest] = process.argv.slice(2);

if (command === '--help' || command === '-h') {
  console.log(`Usage: chat-migrate [${Object.keys(COMMANDS).join('|')}]

Applies the nestjs-chat database schema to a dedicated PostgreSQL database.
Defaults to "${DEFAULT_COMMAND}" when no command is given.

The connection string is read from CHAT_DATABASE_URL, falling back to
DATABASE_URL. Extra arguments are forwarded to the Prisma CLI.`);
  process.exit(0);
}

const prismaArgs = COMMANDS[command];
if (!prismaArgs) {
  fail(`unknown command "${command}". Expected one of: ${Object.keys(COMMANDS).join(', ')}`);
}

const url = process.env.CHAT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  fail('CHAT_DATABASE_URL is not set. Point it at the dedicated chat database.');
}

// Package root, one level up from bin/.
const packageRoot = resolve(__dirname, '..');
const configDir = mkdtempSync(join(tmpdir(), 'chat-migrate-'));
const configPath = join(configDir, 'prisma.config.js');

writeFileSync(
  configPath,
  `const { defineConfig } = require(${JSON.stringify(require.resolve('prisma/config'))});
module.exports = defineConfig({
  schema: ${JSON.stringify(join(packageRoot, 'prisma', 'schema.prisma'))},
  migrations: { path: ${JSON.stringify(join(packageRoot, 'prisma', 'migrations'))} },
  datasource: { url: process.env.CHAT_MIGRATE_DATABASE_URL },
});
`,
);

try {
  const result = spawnSync(
    process.execPath,
    [resolvePrismaCli(), ...prismaArgs, '--config', configPath, ...rest],
    {
      stdio: 'inherit',
      env: { ...process.env, CHAT_MIGRATE_DATABASE_URL: url },
    },
  );

  if (result.error) {
    fail(result.error.message);
  }
  process.exit(result.status ?? 1);
} finally {
  rmSync(configDir, { recursive: true, force: true });
}
