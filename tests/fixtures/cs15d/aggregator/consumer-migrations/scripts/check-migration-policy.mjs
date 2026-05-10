#!/usr/bin/env node
for (const arg of process.argv.slice(2)) {
  if (arg === '--help' || arg === '-h') {
    process.stdout.write('Usage: scaffold policy stub [--quiet]\n');
    process.exit(0);
  }
}
process.exit(0);
