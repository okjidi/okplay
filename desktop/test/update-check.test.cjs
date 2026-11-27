const assert=require('node:assert/strict');
const test=require('node:test');
const {checkForUpdate,downloadUpdate,launchInstaller,isNewer,safeHttps}=require('../update-check.cjs');
const crypto=require('node:crypto'),pair=crypto.generateKeyPairSync('ed25519');
const publicKey=pair.publicKey.export({type:'spki',format:'pem'}).toString();
const sign=fields=>{const payload={schema:1,version:fields.version,url:fields.url,sha256:fields.sha256};return {...payload,signature:crypto.sign(null,Buffer.from(JSON.stringify(payload)),pair.privateKey).toString('base64')};};

test('版本比较只认语义化数字，降级/相同都不提示',()=>{
  assert.equal(isNewer('0.4.0','0.3.0'),true);
  assert.equal(isNewer('0.3.1','0.3.0'),true);
  assert.equal(isNewer('0.3.0','0.3.0'),false);
  assert.equal(isNewer('0.2.9','0.3.0'),false);
  assert.equal(isNewer('latest','0.3.0'),false);
});

test('更新链接只接受 HTTPS 且不能带用户名密码',()=>{
  assert.equal(safeHttps('https://example.com/OKPlay.exe'),'https://example.com/OKPlay.exe');
  assert.equal(safeHttps('http://example.com/OKPlay.exe'),null);
  assert.equal(safeHttps('https://user:pass@example.com/x'),null);
  assert.equal(safeHttps('javascript:alert(1)'),null);
});

test('更新源返回更高版本才提示，且 URL 非法时不提示',async()=>{
  const feed=sign({version:'0.4.0',url:'https://example.com/OKPlay-0.4.0-setup.exe',sha256:'a'.repeat(64)});
  const fetchImpl=async()=>new Response(JSON.stringify(feed),{status:200});
  const result=await checkForUpdate({feedUrl:'https://example.com/feed.json',currentVersion:'0.3.0',publicKey,fetchImpl});
  assert.deepEqual(result,feed);

  const bad=await checkForUpdate({feedUrl:'https://example.com/feed.json',currentVersion:'0.3.0',publicKey,fetchImpl:async()=>new Response(JSON.stringify({version:'0.4.0',url:'http://x/y'}),{status:200})});
  assert.equal(bad,null);

  const same=await checkForUpdate({feedUrl:'https://example.com/feed.json',currentVersion:'0.4.0',publicKey,fetchImpl});
  assert.equal(same,null);
});

test('更新源拒绝过大或无效响应',async()=>{for(const body of ['not-json',' '.repeat(65537)])assert.equal(await checkForUpdate({feedUrl:'https://example.com/feed',currentVersion:'0.3.0',publicKey,fetchImpl:async()=>new Response(body)}),null);});

test('更新包下载后校验哈希，校验失败不留下安装程序',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
 const bytes=Buffer.from('synthetic installer fixture');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'okplay-update-test-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const update=sign({version:'99.0.0',url:'https://example.com/setup.exe',sha256:require('node:crypto').createHash('sha256').update(bytes).digest('hex')});
 const progress=[];
 const options={directory,publicKey,fetchImpl:async()=>new Response(bytes,{headers:{'content-length':String(bytes.length)}}),onProgress:n=>progress.push(n)};
 const installer=await downloadUpdate(update,options);
 assert.deepEqual(await fs.readFile(installer),bytes);
 assert.equal(progress.at(-1),100);
 await assert.rejects(downloadUpdate(sign({...update,sha256:'0'.repeat(64)}),options),/校验失败/);
 const children=await fs.readdir(directory);
 assert.deepEqual(children,[path.basename(path.dirname(installer))]);
});

test('安装器使用静默安装和自动启动参数，启动失败可返回调用方',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'okplay-launch-test-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const installer=path.join(directory,'synthetic.exe'),bytes=Buffer.from('synthetic launch fixture');await fs.writeFile(installer,bytes);
 const update=sign({version:'99.0.0',url:'https://example.test/setup.exe',sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 const {EventEmitter}=require('node:events');
 let invocation;
 const spawnImpl=(...args)=>{
  invocation=args;
  const child=new EventEmitter();
  child.unref=()=>{};
  queueMicrotask(()=>child.emit('spawn'));
  return child;
 };
 await launchInstaller(installer,{update,publicKey,spawnImpl});
 assert.deepEqual(invocation.slice(0,2),[installer,['/S','--updated','--force-run','--keep-shortcuts']]);
 assert.equal(invocation[2].shell,undefined);
 await assert.rejects(launchInstaller(installer,{update,publicKey,spawnImpl:()=>{
  const child=new EventEmitter();
  queueMicrotask(()=>child.emit('error',Error('spawn failed')));
  return child;
 }}),/spawn failed/);
});
