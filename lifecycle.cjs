const fs=require('node:fs/promises'),path=require('node:path');
function createLogger(directory,{maxBytes=262144}={}){
 let queue=Promise.resolve();const file=path.join(directory,'desktop.log');
 return function log(event,details={}){
  const record={time:new Date().toISOString(),event:/^[a-z0-9_-]{1,60}$/.test(event)?event:'unknown'};
  for(const key of ['pid','durationMs','windowMs','documentMs','attempt'])if(Number.isFinite(details[key]))record[key]=Math.round(details[key]);
  if(typeof details.packaged==='boolean')record.packaged=details.packaged;
  for(const key of ['version','electron'])if(typeof details[key]==='string'&&/^[0-9.a-z-]{1,40}$/i.test(details[key]))record[key]=details[key];
  if(typeof details.reason==='string'&&/^[a-z-]{1,60}$/.test(details.reason))record.reason=details.reason;
  if(typeof details.code==='number'||(typeof details.code==='string'&&/^[A-Z0-9_-]{1,40}$/.test(details.code)))record.code=details.code;
  queue=queue.catch(()=>{}).then(async()=>{await fs.mkdir(directory,{recursive:true});try{if((await fs.stat(file)).size>=maxBytes){await fs.copyFile(file,path.join(directory,'desktop.previous.log'));await fs.writeFile(file,'');}}catch(error){if(error.code!=='ENOENT')throw error;}await fs.appendFile(file,JSON.stringify(record)+'\n');});
  return queue.catch(()=>{});
 };
}
function installWindowLifecycle(win,{log=async()=>{},reload=async()=>{},showRecovery=async()=>{},closeTimeoutMs=2500,maxRecoveries=2}={}){
 const contents=win.webContents;
 let closing=false,timer=null,recoveries=[];
 const readyToClose=()=>{if(!closing||win.isDestroyed())return;clearTimeout(timer);win.destroy();};
 const close=event=>{if(win.isDestroyed())return;event.preventDefault();if(closing)return;closing=true;void log('closing');timer=setTimeout(readyToClose,closeTimeoutMs);timer.unref?.();try{win.webContents.send('prepare-close');}catch{readyToClose();}};
 const recover=async reason=>{if(closing||win.isDestroyed())return;const now=Date.now();recoveries=recoveries.filter(time=>now-time<300000);await log('renderer_recovery',{reason,attempt:recoveries.length+1});if(recoveries.length>=maxRecoveries){await showRecovery();return;}recoveries.push(now);try{await reload();}catch{await showRecovery();}};
 const gone=(_event,details)=>{void recover(details.reason).catch(()=>{});};
 win.on('close',close);contents.on('render-process-gone',gone);
 return {readyToClose,recover,retry:async()=>{recoveries=[];await reload();},dispose:()=>{clearTimeout(timer);win.removeListener('close',close);if(!contents.isDestroyed())contents.removeListener('render-process-gone',gone);}};
}
module.exports={createLogger,installWindowLifecycle};
