const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {localResponse,ORIGIN,ENTRY,PREFIX,CSP,forwardOptions}=require('../desktop-service.cjs');
test('恢复固定生产 API 写请求的来源，不给其他站点补来源',()=>{
 const options=forwardOptions(new Request(ORIGIN+'/api/auth/login',{method:'POST',body:'{}'}));
 assert.equal(options.headers.get('Origin'),ORIGIN);
 assert.equal(forwardOptions(new Request('https://example.com/api/auth/login',{method:'POST',body:'{}'})).headers.get('Origin'),null);
 assert.equal(forwardOptions(new Request(ORIGIN+'/api/auth/login',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'})),null);
 assert.equal(forwardOptions(new Request(ORIGIN+'/api/auth/login',{method:'POST',headers:{Origin:'null'},body:'{}'})),null);
 assert.equal(forwardOptions(new Request(ORIGIN+'/api/health')).headers.get('Origin'),null);
});
test('本地入口位于固定生产域名，保持受限 CSP',async()=>{
 assert.equal(new URL(ENTRY).origin,ORIGIN);assert.match(CSP,/script-src 'self';/);assert.match(CSP,/object-src 'none'/);
 const result=await localResponse(ENTRY,path.join(__dirname,'..','app'));
 assert.equal(result.status,200);assert.match(result.headers.get('Content-Type'),/text\/html/);assert.equal(result.headers.get('Content-Security-Policy'),CSP);
 assert.match(await result.text(),/api.js/);
});
test('本地资源拒绝编码目录穿越及非前端文件',async()=>{
 const root=path.join(__dirname,'..','app');
 for(const suffix of ['..%5cpackage.json','%2e%2e%5cmain.cjs','missing.js','vendor/hls.LICENSE'])assert.notEqual((await localResponse(ORIGIN+PREFIX+suffix,root)).status,200);
});
test('应用运行入口不包含示例业务内容和本地假登录',async()=>{
 const code=await fs.readFile(path.join(__dirname,'..','app','app.js'),'utf8');
 assert.doesNotMatch(code,/demo\.mp4|synthetic-password|resourceCategories|const modules=/);
 assert.doesNotMatch(code,/setItem\('preview-session'/);
 assert.match(code,/api\('\/auth\/login'/);
 assert.match(code,/playbackGrantId/);
});
test('主进程保留沙箱、安全隔离和真实会话分区',async()=>{
 const code=await fs.readFile(path.join(__dirname,'..','main.cjs'),'utf8');
 for(const flag of ['contextIsolation:true','sandbox:true','nodeIntegration:false','webSecurity:true'])assert.ok(code.includes(flag));
 assert.ok(code.includes("session.fromPartition('persist:production')"));
 assert.ok(code.includes("const fixture = qa ?"));
});

test('本地视频支持范围请求与越界响应',async()=>{const {fileResponse}=require('../desktop-service.cjs');const file=path.join(__dirname,'..','app','assets','demo.mp4');const full=await fs.readFile(file);const result=await fileResponse(file,'bytes=10-29',{'Content-Type':'video/mp4'});assert.equal(result.status,206);assert.equal(result.headers.get('Content-Range'),`bytes 10-29/${full.length}`);assert.deepEqual(Buffer.from(await result.arrayBuffer()),full.subarray(10,30));assert.equal((await fileResponse(file,'bytes=999999999999-')).status,416);});

test('新异步安全存储读取旧记录时保持设备标识不变',async()=>{const {deviceIdentity}=require('../identity.cjs'),os=require('node:os');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'okplay-identity-'));const safe={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async text=>Buffer.from('cipher:'+text),decryptStringAsync:async bytes=>({result:bytes.toString().slice(7),shouldReEncrypt:false})};const one=await deviceIdentity(dir,safe),two=await deviceIdentity(dir,safe);assert.equal(one,two);assert.match(one,/^[a-f0-9]{32}$/);await assert.rejects(deviceIdentity(dir,{isAsyncEncryptionAvailable:async()=>false}),e=>e.code==='SECURE_STORAGE_UNAVAILABLE');});

test('本地界面 CSP 收敛到自家 API 与视频域，不放行任意 HTTPS', async () => {
  const { CSP } = require('../desktop-service.cjs');
  assert.match(CSP, /connect-src 'self' blob: https:\/\/vod\.okyolo\.com;/);
  assert.match(CSP, /img-src 'self' data:;/);
  assert.match(CSP, /media-src 'self' blob:;/);
  assert.doesNotMatch(CSP, /connect-src[^;]*https:;/);
  assert.doesNotMatch(CSP, /img-src[^;]* https:;/);
  assert.match(CSP, /object-src 'none'/);
  assert.match(CSP, /frame-ancestors 'none'/);
});

test('主进程：生产禁用 DevTools、清空菜单、拦截下载与调试快捷键', async () => {
  const source = await fs.readFile('main.cjs', 'utf8');
  assert.match(source, /devTools:allowDevTools/);
  assert.match(source, /Menu\.setApplicationMenu\(null\)/);
  assert.match(source, /will-download/);
  assert.match(source, /before-input-event/);
  assert.match(source, /f12/i);
});
