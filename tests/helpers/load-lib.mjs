import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const libDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/lib');
const nodeRequire = createRequire(import.meta.url);
const loaded = new Map();

/** Loads a module from src/lib, resolving its own '@/lib/...' imports the same way. */
export function loadLib(name) {
  if (!loaded.has(name)) {
    const mod = { exports: {} };
    loaded.set(name, mod);
    const source = fs.readFileSync(path.join(libDir, `${name}.ts`), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    new Function('module', 'exports', 'require', compiled)(mod, mod.exports, (dep) =>
      dep.startsWith('@/lib/') ? loadLib(dep.slice(6)) : nodeRequire(dep));
  }
  return loaded.get(name).exports;
}
