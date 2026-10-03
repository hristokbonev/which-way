#!/usr/bin/env node
import { homedir } from 'node:os';
import { runCli } from '../src/cli.js';

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  home: homedir(),
  stdout: process.stdout,
  stderr: process.stderr,
});
