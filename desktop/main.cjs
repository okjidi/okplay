const {app,BrowserWindow,ipcMain,screen,session,safeStorage,shell,dialog,Menu}=require('electron');
const {ENTRY,ORIGIN,PREFIX,installService}=require('./desktop-service.cjs');
const {createLogger,installWindowLifecycle}=require('./lifecycle.cjs');
const {checkForUpdate,downloadUpdate,launchInstaller,verifyInstaller,updatePolicy}=require('./update-check.cjs');
const appConfig=require('./package.json');
const path=require('node:path'),fs=require('node:fs/promises'),fsSync=require('node:fs');
const referenceAudit=process.argv.includes('--audit-reference');
const updateSecurityQA=process.argv.includes('--qa-update-security');
const qa=process.argv.includes('--qa')||referenceAudit||updateSecurityQA;
const showQA=process.argv.includes('--qa-visible');
const productionCheck=process.argv.includes('--check-production');
const allowDevTools=process.argv.includes('--dev-tools')&&!app.isPackaged;
const isolated=qa||productionCheck;
const prohibitedFlags=app.isPackaged&&process.argv.some(arg=>['--qa','--qa-visible','--audit-reference','--check-production','--qa-update-security'].includes(arg));
app.commandLine.appendSwitch('no-proxy-server');
if(qa)app.commandLine.appendSwitch('force-device-scale-factor','1');
if(isolated&&!app.isPackaged)app.setPath('userData',path.join(app.getPath('temp'),'okplay-production-check-'+process.pid));
else if(!app.isPackaged) {
  // 源码运行（启动新版OKPlay.cmd）用独立目录：不能和已安装的正式版抢单实例锁、
  // 也不能共用 Chromium 缓存目录，否则第二个实例会报 cache 拒绝访问。
  app.setPath('userData',path.join(app.getPath('appData'),'OKPlay-Desktop-Preview'));
}
else {
  const productionUserData=path.join(app.getPath('appData'),'OKPlay');
  const previewUserData=path.join(app.getPath('appData'),'OKPlay-Desktop-Preview');
  // 预览版升级到正式目录：只在正式目录不存在时复制一次，保留设备标识与日志。
  try { if(!fsSync.existsSync(productionUserData)&&fsSync.existsSync(previewUserData)) fsSync.cpSync(previewUserData,productionUserData,{recursive:true}); } catch {}
  app.setPath('userData',productionUserData);
}
Menu.setApplicationMenu(null);
app.setName('OKPlay');if(process.platform==='win32')app.setAppUserModelId('cn.okbase.okplay.desktop');
const started=Date.now(),log=createLogger(path.join(app.getPath('userData'),'logs'));
let win=null,lifecycle=null;
const primary=!prohibitedFlags&&(isolated||app.requestSingleInstanceLock());
function trusted(event){try{const url=new URL(event.senderFrame.url);return !!win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&url.origin===ORIGIN&&url.pathname.startsWith(PREFIX);}catch{return false;}}
const errorFile=()=>path.join(app.getPath('userData'),'startup-metrics.json');
async function bootstrap(){
 void log('startup',{version:app.getVersion(),electron:process.versions.electron,pid:process.pid,packaged:app.isPackaged});
 const targetSession=session.fromPartition('persist:production');
 const fixture = qa ? require('./test/fixtures.cjs').createFixture() : undefined;
 const sourceDiagnostics=[];
 const workArea=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
 // 默认窗口按主屏工作区比例摆放（基准：1920×1037 上 1425×926 @ (290,40)）。
 const DEFAULT_WINDOW={width:0.742,height:0.893,x:0.151,y:0.039};
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 const width=qa?1600:clamp(Math.round(workArea.width*DEFAULT_WINDOW.width),Math.min(820,workArea.width),workArea.width);
 const height=qa?820:clamp(Math.round(workArea.height*DEFAULT_WINDOW.height),Math.min(550,workArea.height),workArea.height);
 const windowX=qa?undefined:workArea.x+clamp(Math.round(workArea.width*DEFAULT_WINDOW.x),0,Math.max(0,workArea.width-width));
 const windowY=qa?undefined:workArea.y+clamp(Math.round(workArea.height*DEFAULT_WINDOW.y),0,Math.max(0,workArea.height-height));
 win=new BrowserWindow({icon:path.join(__dirname,'app','assets','icon.ico'),width,height,minWidth:Math.min(820,width),minHeight:Math.min(550,height),frame:false,show:!qa||showQA,...(qa?{}:{x:windowX,y:windowY}),backgroundColor:'#151923',webPreferences:{session:targetSession,preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,devTools:allowDevTools,backgroundThrottling:!qa}});
 const windowMs=Date.now()-started;
 await installService(targetSession,{appRoot:__dirname,userData:app.getPath('userData'),safeStorage,version:app.getVersion(),fixture,diagnostics:productionCheck?entry=>sourceDiagnostics.push(entry):undefined});
 const reload=()=>win.loadURL(ENTRY);
 const showRecovery=()=>win.loadURL(ORIGIN+PREFIX+'recovery.html');
 lifecycle=installWindowLifecycle(win,{log,reload,showRecovery});
 win.on('closed',()=>{lifecycle?.dispose();win=null;});
 win.on('app-command',(event,command)=>{if(command==='browser-backward'||command==='browser-forward'){event.preventDefault();win.webContents.send('navigate',command==='browser-backward'?'back':'forward');}});
 win.webContents.on('will-navigate',event=>event.preventDefault());
 win.webContents.on('will-frame-navigate',event=>event.preventDefault());
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 targetSession.setPermissionRequestHandler((contents,permission,callback,details)=>{let own=false;try{own=new URL(details?.requestingUrl||contents.getURL()).origin===ORIGIN;}catch{}callback(contents===win?.webContents&&permission==='fullscreen'&&own);});
 targetSession.on('will-download',(event)=>event.preventDefault());
 win.webContents.on('before-input-event',(event,input)=>{
  const key=(input.key||'').toLowerCase();
  // Ctrl+R / F5：菜单被移除后没有默认刷新键，这里补一条（只刷新当前页，不动会话）。
  if((input.control&&key==='r')||key==='f5'){event.preventDefault();win?.webContents.reload();return;}
  if((input.control&&input.shift&&['i','j','c'].includes(key))||key==='f12'){event.preventDefault();return;}
  if(!allowDevTools&&input.control&&key==='u'){event.preventDefault();}
 });
 win.webContents.on('did-fail-load',(_event,code,_description,_url,mainFrame)=>{if(mainFrame&&code!==-3)void lifecycle.recover('load-failed');});
 win.webContents.on('did-finish-load',()=>{const documentMs=Date.now()-started;void log('document_ready',{windowMs,documentMs,packaged:app.isPackaged});
  void fs.writeFile(errorFile(),JSON.stringify({version:app.getVersion(),electron:process.versions.electron,pid:process.pid,packaged:app.isPackaged,windowMs,documentMs,contentSize:win?.getContentSize()},null,2)).catch(()=>{});});
 let showingUnresponsive=false;
 win.on('unresponsive',async()=>{if(isolated||showingUnresponsive||!win)return;showingUnresponsive=true;await log('unresponsive');try{const result=await dialog.showMessageBox(win,{type:'question',title:'OKPlay',message:'窗口暂时没有响应',detail:'可以继续等待，或重新加载课程界面。',buttons:['继续等待','重新加载'],defaultId:0,cancelId:0});if(result.response===1&&win)await lifecycle.retry();}finally{showingUnresponsive=false;}});
 ipcMain.on('window-action',(event,action)=>{if(!trusted(event))return;if(action==='min')win.minimize();if(action==='max')win.isMaximized()?win.unmaximize():win.maximize();if(action==='close')win.close();if(action==='fullscreen')win.setFullScreen(!win.isFullScreen());});
 const installedWindowsApp=process.platform==='win32'&&app.isPackaged&&
  fsSync.existsSync(path.join(path.dirname(process.execPath),'Uninstall OKPlay.exe'));
 let updateRequest, availableUpdate;
 const releasePolicy=updatePolicy({packaged:app.isPackaged,configuration:appConfig.okplay,environment:process.env});
 const updatePublicKey=qa?fixture.updatePublicKey:releasePolicy.publicKey;
 async function findUpdate(){
  if(!qa&&!installedWindowsApp)return null;
  try{
   const options={currentVersion:app.getVersion(),feedUrl:releasePolicy.feedUrl,publicKey:updatePublicKey};
   if(qa){
    options.feedUrl='https://example.com/update-feed';
    options.fetchImpl=async()=>new Response(JSON.stringify(fixture.signUpdateFeed(fixture.state.updateFeed)));
   }
   availableUpdate=await checkForUpdate(options);
   if(availableUpdate)void log('update_available',{version:availableUpdate.version});
   return availableUpdate?.version??null;
  }catch{
   void log('update_check_failed');
   return null;
  }
 }
 ipcMain.handle('check-app-update',event=>{
  if(!trusted(event))return null;
  if(qa)return findUpdate();
  return updateRequest??=findUpdate();
 });
 let downloadController, downloadedInstaller, installerLaunched=false, installerStarting=false;
 win.once('closed',()=>{
  downloadController?.abort();
  if(downloadedInstaller&&!installerLaunched){
   void fs.unlink(downloadedInstaller).then(()=>fs.rmdir(path.dirname(downloadedInstaller))).catch(()=>{});
  }
 });
 ipcMain.handle('download-app-update',async event=>{
  if(!trusted(event)||!availableUpdate||downloadController||installerStarting||installerLaunched)return 'failed';
  const updateWindow=win;
  downloadController=new AbortController();
  try{
   if(!downloadedInstaller){
    downloadedInstaller=await downloadUpdate(availableUpdate,{
     directory:app.getPath('temp'),signal:downloadController.signal,publicKey:updatePublicKey,
     ...(qa?{fetchImpl:async()=>new Response(fixture.state.updateBytes, {headers:{'content-length':String(fixture.state.updateBytes.length)}})}:{}),
     onProgress:percent=>{if(!updateWindow.isDestroyed())updateWindow.webContents.send('update-progress',percent);}
    });
   }
   return 'ready';
  }catch{
   void log('update_download_failed');
   return 'failed';
  }finally{downloadController=null;}
 });
 ipcMain.handle('install-app-update',async event=>{
  if(!trusted(event)||!downloadedInstaller||downloadController||installerStarting||installerLaunched)return false;
  const updateWindow=win;
  installerStarting=true;
  try{
   if(qa){
    await verifyInstaller(downloadedInstaller,availableUpdate,updatePublicKey);
    fixture.state.updateDownloaded=await fs.readFile(downloadedInstaller);
    if(fixture.state.updateLaunchFails)throw Error('fixture installer launch failed');
    fixture.state.updateInstallReleaseCount=fixture.state.released;
   }else{
    await launchInstaller(downloadedInstaller,{update:availableUpdate,publicKey:updatePublicKey});
    installerLaunched=true;
   }
   if(!updateWindow.isDestroyed())updateWindow.close();
   return true;
  }catch{
   void log('update_install_failed');
   return false;
  }finally{installerStarting=false;}
 });
 ipcMain.handle('app-version',event=>trusted(event)?app.getVersion():null);
 ipcMain.handle('auto-update-enabled',event=>trusted(event)&&!qa);
 ipcMain.on('close-ready',event=>{if(trusted(event))lifecycle.readyToClose();});
 ipcMain.on('reload-app',event=>{if(trusted(event))void lifecycle.retry().catch(()=>showRecovery());});
 ipcMain.on('renderer-issue',event=>{if(trusted(event))void log('renderer_issue');});
 ipcMain.handle('open-external',async(event,value)=>{if(!trusted(event)||typeof value!=='string'||value.length>8192)return false;try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return false;if(qa){fixture.state.openedUrls.push(url.href);return true;}await shell.openExternal(url.href);return true;}catch{return false;}});
 try{if(qa){await require(updateSecurityQA?'./test/update-security-qa.cjs':referenceAudit?'./test/reference-capture.cjs':'./qa.cjs')(win,ENTRY,fixture);app.exit(0);}else if(productionCheck){await require('./production-check.cjs')(win,ENTRY,sourceDiagnostics);app.exit(0);}else await reload();}
 catch(error){if(qa)await fs.writeFile(path.join(__dirname,'design','QA-error.txt'),String(error.stack||error));if(productionCheck)await fs.writeFile(path.join(__dirname,'design','production-check-error.txt'),'生产检查失败');await log('startup_failed',{code:error.code});if(isolated){console.error(error);app.exit(1);}else await showRecovery().catch(()=>app.quit());}
}
if(!primary){if(prohibitedFlags)app.exit(64);else app.quit();}
else{
 app.on('second-instance',()=>{if(!win||win.isDestroyed())return;if(win.isMinimized())win.restore();win.show();win.focus();void log('second_instance');});
 app.on('window-all-closed',()=>{if(!isolated)app.quit();});
 app.whenReady().then(bootstrap).catch(async error=>{await log('initialization_failed',{code:error.code});if(isolated)console.error(error);else dialog.showErrorBox('OKPlay 启动失败','无法初始化课程客户端。请重新启动；系统安全存储暂时不可用时，稍后重试。');app.exit(1);});
 process.on('uncaughtException',error=>{void log('uncaught_exception');if(isolated){console.error(error);app.exit(1);return;}if(win&&!win.isDestroyed())void lifecycle?.recover('unexpected-error').catch(()=>app.quit());else app.quit();});
 process.on('unhandledRejection',error=>{void log('unhandled_rejection');if(isolated){console.error(error);app.exit(1);}});
}
