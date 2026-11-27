module.exports=async function(win,page,sourceDiagnostics){
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {ORIGIN}=require('./desktop-service.cjs');
const checks={date:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),origin:ORIGIN,authenticated:false};
const session=win.webContents.session;
for(const [key,route] of [['health','/api/health'],['identity','/api/auth/me'],['captcha','/api/auth/captcha']]){
 const response=await session.fetch(ORIGIN+route,{bypassCustomProtocolHandlers:true,signal:AbortSignal.timeout(15000)});
 checks[key]={status:response.status};
 if(key==='health')assert.equal(response.status,200);
 if(key==='identity')assert.equal(response.status,401);
 if(key==='captcha'){assert.equal(response.status,200);const body=await response.json();checks.captcha.enabled=body.enabled;checks.captcha.kind=body.kind||null;}
}
await win.loadURL(page);
for(let i=0;i<150;i++){
 if(await win.webContents.executeJavaScript("!!document.querySelector('#login')"))break;
 await new Promise(r=>setTimeout(r,100));
}
assert.equal(await win.webContents.executeJavaScript('location.origin'),ORIGIN);
assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('#login')"),true);
await win.webContents.executeJavaScript("Promise.all([...document.querySelectorAll('[data-brand]')].map(i=>i.decode().catch(()=>{})))");
checks.brandLoaded=await win.webContents.executeJavaScript("document.querySelectorAll('[data-brand]').length===2&&[...document.querySelectorAll('[data-brand]')].every(i=>i.naturalWidth>0&&!i.dataset.fallback)");
assert.equal(checks.brandLoaded,true,'生产 LOGO 应在标题栏和登录页正常加载');
checks.localInterface=true;checks.webSecurity=win.webContents.getLastWebPreferences().webSecurity;
checks.sourceValidation=await win.webContents.executeJavaScript("okplayApi.request('/auth/login',{method:'POST',body:{}}).then(()=>({status:200})).catch(e=>({status:e.status,message:e.message}))");
checks.sourceDiagnostics=sourceDiagnostics;
const shot=await win.webContents.capturePage();await fs.writeFile(path.join(__dirname,'design','生产登录页.png'),shot.toPNG());
await fs.writeFile(path.join(__dirname,'design','production-check.json'),JSON.stringify(checks,null,2));
assert.equal(checks.sourceValidation.status,400,'空登录请求应通过来源校验，再由参数校验拒绝');
assert.equal(checks.sourceValidation.message,'请填写账号和密码');
console.log('生产检查通过：健康 200、未登录身份 401、验证码 200；空登录请求通过来源校验，返回参数校验 400。未提交账号密码。');
};
