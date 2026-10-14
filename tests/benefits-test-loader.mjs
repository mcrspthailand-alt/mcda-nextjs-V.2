import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const nativeRequire = createRequire(import.meta.url);
export function moduleLoader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    let absolute = path.isAbsolute(file) ? file : path.join(root, file);
    if (!existsSync(absolute)) absolute += '.ts';
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const source = readFileSync(absolute, 'utf8');
    const result = ts.transpileModule(source, {
      fileName:absolute, reportDiagnostics:true,
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
    });
    assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
    const module = { exports:{} }; cache.set(absolute,module);
    new Function('require','exports','module',result.outputText)(name => {
      if (Object.hasOwn(overrides,name)) return overrides[name];
      if (name.startsWith('@/')) return load(path.join(root,name.slice(2)));
      if (name.startsWith('.')) return load(path.resolve(path.dirname(absolute),name));
      return nativeRequire(name);
    },module.exports,module);
    return module.exports;
  }
  return load;
}
