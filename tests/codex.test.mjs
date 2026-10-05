import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
function load(sourcePath, { execFile, env = {} } = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Buffer, console,
    process: { env },
    require: (name) => name === 'server-only' ? {} : name === 'node:child_process' ? { execFile } : nodeRequire(name),
  });
  return module.exports;
}

const image = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64')}`;
const receipt = {
  storeName: 'Test Market', date: '2026-10-05', taxTotal: 0, basketDiscount: 0, receiptTotal: 0,
  items: [{ name: 'Free item', quantity: 1, unitPrice: 0, totalPrice: 0, lineDiscount: 0, isTaxable: false }],
};

function boot({ failure, output = JSON.stringify(receipt), hold, env = {} } = {}) {
  const calls = [];
  const adapter = load('src/lib/codex.ts', { env, execFile(bin, args, options, callback) {
    calls.push({ bin, args, options });
    if (args.includes('status')) return callback(null, 'Logged in using ChatGPT', '');
    if (hold) return hold({ args, options, callback });
    if (failure) return callback(failure.error, '', failure.stderr);
    fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], output);
    callback(null, 'Progress output is not the final receipt', '');
  } });
  return { ...adapter, calls };
}

test('scan attaches decoded images, reads final structured output, preserves zero amounts and cleans up', async () => {
  const adapter = boot({ env: { PATH: '/usr/bin', CODEX_HOME: '/private/codex', GEMINI_API_KEY: 'secret', OPENAI_API_KEY: 'secret', RECEIPT_CODEX_MODEL: 'configured-model' } });
  const result = await adapter.parseReceiptImages([image, image]);
  assert.equal(result.items[0].unitPrice, 0);
  assert.equal(result.items[0].totalPrice, 0);
  assert.match(result.items[0].id, /^item-/);
  const scan = adapter.calls[1];
  assert.equal(adapter.calls[0].args.includes('--ignore-user-config'), false);
  assert.ok(scan.args.indexOf('exec') < scan.args.indexOf('--ignore-user-config'));
  assert.equal(scan.args.filter((value) => value === '--image').length, 2);
  assert.equal(scan.args[scan.args.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(scan.args.includes('--ephemeral'));
  assert.ok(scan.args.includes('features.shell_tool=false'));
  assert.ok(scan.args.includes('configured-model'));
  assert.equal(scan.options.timeout, 120000);
  assert.equal(scan.options.env.OPENAI_API_KEY, undefined);
  assert.equal(scan.options.env.GEMINI_API_KEY, undefined);
  assert.equal(fs.existsSync(scan.options.cwd), false);
});

test('failed, invalid and empty output produce friendly errors and remove temporary photos', async () => {
  for (const output of ['<html>error</html>', '{}', JSON.stringify({ ...receipt, items: [] }), JSON.stringify({ ...receipt, taxTotal: -1 })]) {
    const adapter = boot({ output });
    await assert.rejects(adapter.parseReceiptImages([image]), (error) => error.code === 'INVALID_RECEIPT' && error.status === 502);
    assert.equal(fs.existsSync(adapter.calls[1].options.cwd), false);
  }
});

test('CLI failures distinguish expired login, usage limits and scan timeout without exposing stderr', async () => {
  for (const [failure, code, status] of [
    [{ error: { code: 1 }, stderr: '401 unauthorized token secret' }, 'LOGIN_REQUIRED', 503],
    [{ error: { code: 1 }, stderr: '429 usage limit' }, 'USAGE_LIMIT', 503],
    [{ error: { killed: true }, stderr: 'secret' }, 'SCAN_TIMEOUT', 504],
  ]) {
    const adapter = boot({ failure });
    await assert.rejects(adapter.parseReceiptImages([image]), (error) => error.code === code && error.status === status && !error.message.includes('secret'));
    assert.equal(fs.existsSync(adapter.calls[1].options.cwd), false);
  }
});

test('unauthenticated status is safe and an unauthenticated scan never launches exec', async () => {
  const calls = [];
  const adapter = load('src/lib/codex.ts', { execFile(bin, args, options, callback) {
    calls.push(args);
    callback({ code: 1 }, '', 'Not logged in');
  } });
  assert.equal((await adapter.getCodexStatus()).authenticated, false);
  await assert.rejects(adapter.parseReceiptImages([image]), (error) => error.code === 'LOGIN_REQUIRED');
  assert.equal(calls.some((args) => args.includes('exec')), false);
});

test('a missing CLI reports setup needed instead of raw spawn errors', async () => {
  const adapter = load('src/lib/codex.ts', { execFile(bin, args, options, callback) { callback({ code: 'ENOENT' }, '', ''); } });
  assert.equal((await adapter.getCodexStatus()).installed, false);
  await assert.rejects(adapter.parseReceiptImages([image]), (error) => error.code === 'CLI_MISSING');
});

test('overlapping scans are rejected and the slot is released after completion', async () => {
  let finish;
  const adapter = boot({ hold: ({ args, callback }) => { finish = () => { fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], JSON.stringify(receipt)); callback(null, '', ''); }; } });
  const first = adapter.parseReceiptImages([image]);
  await assert.rejects(adapter.parseReceiptImages([image]), (error) => error.code === 'SCAN_BUSY' && error.status === 429);
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  finish();
  await first;
  const second = adapter.parseReceiptImages([image]);
  finish = undefined;
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  finish();
  await second;
});

test('invalid uploads are rejected before launching Codex', async () => {
  const adapter = boot();
  for (const input of [[], [image, image, image, image], ['data:image/heic;base64,AAAA'], ['data:image/png;base64,AAAA']]) {
    await assert.rejects(adapter.parseReceiptImages(input), (error) => error.status === 400);
  }
  await assert.rejects(adapter.parseReceiptImages(['x'.repeat(12 * 1024 * 1024)]), (error) => error.status === 413);
  assert.equal(adapter.calls.length, 0);
});

test('non-JSON HTTP failures show an actionable error instead of JSON.parse', async () => {
  const { readReceiptResponse } = load('src/lib/receipt-response.ts');
  await assert.rejects(readReceiptResponse(new Response('<html>too large</html>', { status: 413 })), /photos are too large/);
  await assert.rejects(readReceiptResponse(new Response('Bad gateway', { status: 502 })), /HTTP 502/);
  await assert.rejects(readReceiptResponse(Response.json({ error: 'Sign in to Codex' }, { status: 503 })), /Sign in to Codex/);
  const result = await readReceiptResponse(Response.json(receipt));
  assert.equal(result.storeName, 'Test Market');
});
