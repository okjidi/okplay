import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('IPC only accepts the current window main frame and its own page or exact offline document', async () => {
  const source = readFileSync(new URL('../src/main/ipc.ts', import.meta.url), 'utf8');
  // Execute the real handler module with isolated Electron/log/updater dependencies.
  const handles = new Map<string, Function>(); const events = new Map<string, Function>();
  let opens = 0; let quits = 0; let reloads = 0; let checks = 0;
  const mainFrame = { url: 'https://learn.example.test/course/7' };
  const contents = { mainFrame };
  const win = { isDestroyed: () => false, webContents: contents, loadURL: async () => { reloads++; } };
  const replacements = `const { app, ipcMain, shell, IPC, log, checkForUpdate, parseHttpsUrl, join, pathToFileURL } = globalThis.__ipcTest;\n`;
  const injected = source.replace(/^import[^;]+;\s*/gm, '');
  (globalThis as any).__ipcTest = {
    app: { quit: () => { quits++; } },
    ipcMain: { handle: (k: string, fn: Function) => handles.set(k, fn), on: (k: string, fn: Function) => events.set(k, fn) },
    shell: { openExternal: async () => { opens++; } },
    IPC: { openExternal: 'open', checkForUpdate: 'check', reload: 'reload', quit: 'quit' },
    log: { info() {}, warn() {} }, checkForUpdate: async () => { checks++; return null; },
    parseHttpsUrl: (raw: string) => { try { const url = new URL(raw); return url.protocol === 'https:' ? url : null; } catch { return null; } },
    join, pathToFileURL,
  };
  // __dirname is the built main directory, exactly as in the real Electron module.
  const js = ts.transpileModule(`${replacements}const __dirname='E:/fake/dist/main';\n${injected}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { registerIpcHandlers } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  registerIpcHandlers({ origin: 'https://learn.example.test', pageUrl: 'https://learn.example.test/' }, () => win);
  const good = { sender: contents, senderFrame: mainFrame };
  const child = { sender: contents, senderFrame: { url: mainFrame.url } };
  const other = { sender: { mainFrame }, senderFrame: mainFrame };
  for (const bad of [child, other, { sender: contents }]) {
    await handles.get('open')!(bad, 'https://example.test');
    await handles.get('check')!(bad);
    events.get('reload')!(bad); events.get('quit')!(bad);
  }
  assert.deepEqual({ opens, quits, reloads, checks }, { opens: 0, quits: 0, reloads: 0, checks: 0 });

  // 本站页面：允许打开 https 链接、查更新；**不允许** reload / quit
  //（2026-11-05：站点被 XSS 时也不能关掉客户端）。
  await handles.get('open')!(good, 'https://example.test');
  await handles.get('check')!(good);
  events.get('reload')!(good); events.get('quit')!(good);
  assert.equal(opens, 1); assert.equal(checks, 1); assert.equal(reloads, 0); assert.equal(quits, 0);

  mainFrame.url = 'https://attacker.example.test/';
  events.get('quit')!(good); assert.equal(quits, 0);

  // 本地离线页：reload / quit 都允许；只有这一个确切文档。
  mainFrame.url = 'file:///E:/fake/dist/renderer-local/offline.html?reason=offline';
  events.get('reload')!(good); events.get('quit')!(good);
  assert.equal(reloads, 1); assert.equal(quits, 1);
  mainFrame.url = 'file:///E:/fake/dist/renderer-local/other.html';
  events.get('quit')!(good); events.get('reload')!(good);
  assert.equal(quits, 1); assert.equal(reloads, 1);
});
