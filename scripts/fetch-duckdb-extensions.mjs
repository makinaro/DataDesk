#!/usr/bin/env node
// Downloads the DuckDB extensions DataDesk needs into resources/duckdb-extensions/.
// The app never auto-installs extensions at query time (autoinstall/autoload are off, and the
// instance is locked down), so this runs once per machine, in CI, and at packaging time.
// DuckDB verifies extension signatures on INSTALL and LOAD.

import { mkdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';

const EXTENSIONS = ['excel'];
const dir = resolve('resources/duckdb-extensions');
mkdirSync(dir, { recursive: true });

const instance = await DuckDBInstance.create(':memory:');
const connection = await instance.connect();
await connection.run(`SET extension_directory = '${dir.split(sep).join('/')}'`);
for (const name of EXTENSIONS) {
  await connection.run(`INSTALL ${name}`);
  await connection.run(`LOAD ${name}`);
  const reader = await connection.runAndReadAll(
    `SELECT extension_version, install_path FROM duckdb_extensions() WHERE extension_name = '${name}'`,
  );
  const [row] = reader.getRowObjectsJson();
  console.log(`installed ${name} ${String(row?.extension_version)} → ${String(row?.install_path)}`);
}
connection.closeSync();
instance.closeSync();
