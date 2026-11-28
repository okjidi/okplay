const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
 windowAction:action=>ipcRenderer.send('window-action',action),
 openExternal:url=>ipcRenderer.invoke('open-external',url),
 version:()=>ipcRenderer.invoke('app-version'),checkUpdate:()=>ipcRenderer.invoke('check-app-update'),
 downloadUpdate:()=>ipcRenderer.invoke('download-app-update'),
 installUpdate:()=>ipcRenderer.invoke('install-app-update'),autoUpdate:()=>ipcRenderer.invoke('auto-update-enabled'),
 onUpdateProgress:callback=>{ipcRenderer.on('update-progress',(_event,percent)=>callback(percent));},
 onNavigate:callback=>{const listener=(_event,direction)=>callback(direction);ipcRenderer.on('navigate',listener);return ()=>ipcRenderer.removeListener('navigate',listener);},
 onPrepareClose:callback=>{const listener=()=>callback();ipcRenderer.on('prepare-close',listener);return ()=>ipcRenderer.removeListener('prepare-close',listener);},
 closeReady:()=>ipcRenderer.send('close-ready'),
 reload:()=>ipcRenderer.send('reload-app'),
 reportIssue:()=>ipcRenderer.send('renderer-issue')
});

window.addEventListener('unload',()=>{ipcRenderer.removeAllListeners('update-progress');ipcRenderer.removeAllListeners('navigate');ipcRenderer.removeAllListeners('prepare-close');},{once:true});
