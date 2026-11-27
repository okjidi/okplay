module.exports=async function(win,page,fixture){
 const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path');
 const run=code=>win.webContents.executeJavaScript(code,true);
 const wait=async code=>{const end=Date.now()+10000;while(Date.now()<end){if(await run(code))return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('更新隔离验收等待超时');};
 const load=async()=>{await win.loadURL(page);await wait("!!document.querySelector('#login')");};
 const checks=[];
 fixture.state.updateBytes=Buffer.from('synthetic signed installer; never executed');
 fixture.state.updateFeed={version:'99.0.0',url:'https://example.com/okplay-update.exe',sha256:crypto.createHash('sha256').update(fixture.state.updateBytes).digest('hex')};
 for(const mode of ['unsigned','wrong-key']){
  fixture.state.updateSignatureMode=mode;await load();
  assert.equal(await run('window.desktop.checkUpdate()'),null);
  assert.equal(await run("document.querySelector('.window-update').hidden"),true);
  assert.equal(await run('window.desktop.downloadUpdate()'),'failed');checks.push(mode+' rejected before download');
 }
 fixture.state.updateSignatureMode='valid';await load();
 await wait("document.querySelector('.window-update').hidden===false");
 fixture.state.updateLaunchFails=true;
 await run("document.querySelector('.window-update').click()");
 await wait("document.querySelector('dialog').textContent.includes('无法启动安装程序')");
 assert.deepEqual(fixture.state.updateDownloaded,fixture.state.updateBytes);
 assert.equal(win.isDestroyed(),false);checks.push('signed download, hash and execution-time verification accepted');
 fixture.state.updateLaunchFails=false;
 const closed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('更新隔离关闭超时')),4000);win.once('closed',()=>{clearTimeout(timer);resolve();});});
 await run("document.querySelector('.window-update').click()");await closed;
 assert.deepEqual(fixture.state.updateDownloaded,fixture.state.updateBytes);checks.push('verified installer launch simulated; application closed');
 const output=path.join(__dirname,'..','design','update-security-qa.json');await fs.mkdir(path.dirname(output),{recursive:true});
 await fs.writeFile(output,JSON.stringify({passed:true,checks,productionRequests:false,nativeInstallerExecuted:false},null,2));
};
