import { app, ipcMain, shell, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { IPC } from '../shared/contracts';
import type { AppConfig } from './config';
import { log } from './log';
import { parseHttpsUrl } from './security/url';
import { checkForUpdate } from './updater';

/**
 * IPC 白名单。**逐条显式注册，不用通配。**
 *
 * 判定准则（PRD §14 NFR-SEC-006A）：即使攻击者拿到页面 JS 执行权、
 * 把这些通道全调一遍，也不产生额外损失。所以这里**不做任何授权判定** ——
 * 「是否登录」「是否有课程权限」全部由服务端回答。
 */
export function registerIpcHandlers(config: AppConfig, getWindow: () => BrowserWindow | null): void {
  const offlineDocument = pathToFileURL(join(__dirname, '..', 'renderer-local', 'offline.html')).href;

  /**
   * 调用方是谁：本站页面 / 本地离线页 / 其它（一律拒）。
   *
   * 2026-11-05 拆成两档：`quit` / `reload` 只给离线页 —— 站点一旦被 XSS，
   * 恶意脚本最多只能打开 https 链接或查更新，不能再把学员的客户端关掉。
   */
  const frameKind = (event: IpcMainEvent | IpcMainInvokeEvent): 'site' | 'offline' | null => {
    try {
      const win = getWindow();
      if (!win || win.isDestroyed() || event.sender !== win.webContents) return null;
      const frame = event.senderFrame;
      if (!frame || frame !== win.webContents.mainFrame) return null;
      const url = new URL(frame.url);
      if ((url.protocol === 'https:' || url.protocol === 'http:') && url.origin === config.origin) return 'site';
      // 离线页仍需要退出/重试；只允许这个确切文档，不能放行任意 file://。
      url.search = '';
      url.hash = '';
      return url.href === offlineDocument ? 'offline' : null;
    } catch {
      return null; // frame 已销毁或 URL 不合法。
    }
  };
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => frameKind(event) !== null;
  const trustedOfflineOnly = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => frameKind(event) === 'offline';

  ipcMain.handle(IPC.openExternal, async (event, rawUrl: unknown) => {
    if (!trusted(event)) return false;
    const target = parseHttpsUrl(rawUrl);
    if (!target) {
      log.warn('拒绝打开非 https 链接', { url: String(rawUrl) });
      return false;
    }

    await shell.openExternal(target.toString());
    return true;
  });

  let updateCheck: ReturnType<typeof checkForUpdate> | null = null;
  ipcMain.handle(IPC.checkForUpdate, async (event) => {
    if (!trusted(event)) return null;
    if (!updateCheck) updateCheck = checkForUpdate().finally(() => { updateCheck = null; });
    return updateCheck;
  });

  ipcMain.on(IPC.reload, (event) => {
    if (!trustedOfflineOnly(event)) return;
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    log.info('页面请求重新加载', { url: config.pageUrl });
    // load 失败由既有 failover 处理，避免拒绝的 Promise 成为未处理异常。
    void win.loadURL(config.pageUrl).catch(() => undefined);
  });

  ipcMain.on(IPC.quit, (event) => {
    if (!trustedOfflineOnly(event)) return;
    log.info('页面请求退出应用');
    app.quit();
  });

  log.info('IPC 通道已注册', { channels: Object.values(IPC).length });
}
