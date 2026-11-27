# 新 OKPlay 桌面端

**更新安全变更（2026-11-27）**：当前未配置固定发布公钥，应用内自动更新默认关闭，不显示更新按钮。启用必须使用 Ed25519 签名清单；正式包不接受环境变量替换更新源。下方旧版一键更新说明仅适用于已经完成签名配置的新构建，详见 [UPDATE_SIGNING.md](UPDATE_SIGNING.md)。本轮未覆盖任何已有发行包。

双击「启动新版OKPlay.cmd」或运行 `npm start`，使用正式学员账号登录。运行时已包含，不依赖旧项目目录。

## 界面与数据

正常启动连接 https://learn.okyolo.com，课程、独立视频、目录/分页/搜索/详情、咨询、课程激活与支付均走正式接口。失败时显示实际错误，不回退演示数据。

窗口创建后立即显示，默认总宽1600px、高820px，小屏按可用尺寸收窄。左侧导航200px，右侧内容区紧接侧栏、20px内边距、正文最大1360px。全部课程为左侧独立菜单。

登录框按旧版380px宽、原字号和控件尺寸；静音循环背景、LOGO、申请账号、记住账号与小程序提示均对齐。拼图直接拖图、松手提交；文字验证码填满提交，错误时换题重试。只保存账号，不保存密码。

学习中心包含五列我的课程、六列其他教程、激活与搜索，已移除继续学习。资源五模块为六列无框封面和14px两级目录。全部课程按分类分组，默认每组5门，可展开。

课程详情包括封面、信息、笔记下载和课时卡片。视频占满右侧，笔记位于下方；支持HLS、服务端DRM参数、进度与释放、按账号课时续播，以及定位、倍速至4×、音量、亮度、清晰度选择和全屏。

资源/笔记下载展示完整地址和提取码，在系统浏览器打开HTTPS地址。微信订单只在用户点击扫码购课后创建；二维码状态以服务端为准，无自动购买或客户端自判支付成功。

## 安全与运行

本地界面位于固定生产域名专用路径；API交由Chromium HTTPS网络栈。HttpOnly/Secure会话、系统加密设备标识、sandbox/contextIsolation/webSecurity保持启用；仅本页面全屏权限放行。不复制旧客户端Cookie，首次需要登录。

- CSP 已收敛：`connect-src 'self' blob: https://vod.okyolo.com`、`img-src 'self' data:`、`media-src 'self' blob:`，不再放行任意 HTTPS
- 生产禁用 DevTools（仅未打包时可用 `--dev-tools`），应用菜单已清空，F12/Ctrl+Shift+I/J/C 被拦截
- 下载被拦截（`will-download` preventDefault）
- userData 使用 `%APPDATA%\OKPlay`；首次运行会从旧 `OKPlay-Desktop-Preview` 迁移设备标识与日志
- 更新检查：默认地址 `https://learn.okyolo.com/app/update.json`（`package.json` 的 `okplay.updateFeed`），可用环境变量 `OKPLAY_UPDATE_URL` 覆盖。该文件内容为 `{ "version": "x.y.z", "url": "https://…/OKPlay-x.y.z-x64.exe", "sha256": "<安装包 SHA-256>" }`；启动时检查，有新版本时最小化按钮右侧出现绿色「更新」按钮，Windows 安装版点击后自动下载、校验、静默安装并重启。便携版请用新版压缩包更新

HLS、QRCode及许可证在 `app/vendor`。原始背景视频和原版图标随项目提供。

## 验收

- `npm test`：820px默认高度下的隔离Electron交互验收，不写生产；可追加 `-- --qa-visible`。
- `npm run test:unit`：**23 项**（安全边界、CSP、DevTools/下载拦截、资源入口、媒体范围请求、笔记 XSS、更新检查）。
- `npm run check:production`：独立会话检查健康、未登录身份、验证码和空参数来源校验，不提交账号密码。
- `npm run audit:reference`：对已保存的旧版只读副本运行隔离截图对照。
- `npm run dist`：electron-builder 出 `release/OKPlay-<版本>-x64.exe`（NSIS）与同名 `.zip`；卸载保留 userData。
- `npm run dist:release`：先打包到 `release/`，再生成 `release/update.json` 更新源。
- `npm run update:feed -- <目录>`：为已有产物单独生成 `update.json`。

**仍需人工**：真实学员账号登录、CDN/DRM 播放、微信扫码支付与回调，自动化无法替代。

完整检查报告：`design/全面检查-20261125/检查报告.md`。旧版、修复前/后、登录框尺寸对照和16项总览均在该目录。截图使用隔离合成数据；真实账号生产CDN/DRM及真实支付回调尚未实操验证。


## 0.3.0 上线优化与候选包（2026-11-26）

已完成HLS/二维码按需加载、首屏图片优化、GET并发合并与会话取消、播放错误释放与旧响应隔离、订单复用及串行查询、单实例、关闭前清理、崩溃重载页和限量日志。Electron45.5.0使用异步safeStorage。

首屏脚本705401→69347字节，约减少90.2%（不是启动耗时比例）。保留当前1600×820、200px侧栏及现有布局。

正式数据目录为 `%APPDATA%/OKPlay`，首次可迁移本新版预览目录；日志在其logs子目录，不保存密码、Cookie、令牌或签名地址。

- `npm run dist:candidate`：本地生成Windows候选安装包和便携包，不自动发布。
- `npm run verify:release`：核对包内源码、资源引用、测试数据排除及SHA256。
- 本轮验证的文件在 `release-candidate/`，请勿与原release目录旧包混用。
- 发行程序启动、单实例与诊断参数拒绝已实测；真实账号CDN/DRM、实际支付、干净Windows安装升级仍需最终验收，包当前未签名。

完整报告：`design/上线优化-20261125/上线优化报告.md`；使用说明：`release-candidate/发行说明.md`。

## 一键更新（0.3.1）

适用于 Windows NSIS 安装版。更新源仍使用 OKPLAY_UPDATE_URL，元数据包含新版版本号、HTTPS 安装包地址和 SHA-256。点击绿色「更新」按钮后，客户端下载并校验安装包，提交最终播放进度与释放授权，再启动 NSIS 静默更新并自动重新打开。用户可在下载或启动安装失败后重试。

## 版本与发布

- 版本号在 `package.json` 的 `version`，当前 `0.4.0`；应用内「我的账号」弹窗显示运行版本。
- 打包：`npm run dist:release` → `release/OKPlay-<版本>-x64.exe`、`.zip`、`update.json`、`release-manifest.json`。
- 发布：把 `.exe` 与 `update.json` 上传到 `https://learn.okyolo.com/app/`，`update.json` 里的 `url`/`sha256` 必须与实际安装包一致。
- 升级时先改 `version`（如 `0.4.1`）再打包，保证新版本号大于已安装版本，否则客户端不会提示更新。
