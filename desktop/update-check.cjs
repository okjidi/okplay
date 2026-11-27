const {createHash,createPublicKey,verify}=require('node:crypto');
const {createReadStream}=require('node:fs');
const {createWriteStream}=require('node:fs');
const fs=require('node:fs/promises');
const path=require('node:path');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');

/**
 * 更新只信构建时固定的Ed25519发布公钥。未配置/清单未签名，一律禁用。
 * SHA256校验下载完整性；独立发布签名验证版本、地址和hash的真实性。
 */

function parseVersion(value) {
  const match = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:[-+].*)?$/.exec(String(value ?? '').trim());
  return match ? match.slice(1, 4).map(Number) : null;
}

function isNewer(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

function safeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function releaseKey(value) {
  if(typeof value!=='string'||!value.includes('-----BEGIN PUBLIC KEY-----'))return null;
  try{const key=createPublicKey(value);return key.asymmetricKeyType==='ed25519'?key:null;}catch{return null;}
}

function manifestPayload(data) {
  if(data?.schema!==1||typeof data.version!=='string'||data.version.length>80||!parseVersion(data.version)||data.version!==data.version.trim())return null;
  const url=safeHttps(data.url);
  if(!url||url!==data.url||!new URL(url).pathname.toLowerCase().endsWith('.exe')||typeof data.sha256!=='string'||!/^[a-f0-9]{64}$/.test(data.sha256))return null;
  return Buffer.from(JSON.stringify({schema:1,version:data.version,url,sha256:data.sha256}),'utf8');
}

function verifyUpdateManifest(data,publicKey) {
  const key=releaseKey(publicKey),payload=manifestPayload(data);
  if(!key||!payload||typeof data.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(data.signature))return null;
  try{
    const signature=Buffer.from(data.signature,'base64');
    if(signature.length!==64||signature.toString('base64')!==data.signature||!verify(null,payload,key,signature))return null;
    return {schema:1,version:data.version,url:data.url,sha256:data.sha256,signature:data.signature};
  }catch{return null;}
}

function updatePolicy({packaged,configuration={},environment={}}) {
  const publicKey=configuration.updatePublicKey;
  const candidate=packaged?configuration.updateFeed:(environment.OKPLAY_UPDATE_URL||configuration.updateFeed);
  return {feedUrl:releaseKey(publicKey)?safeHttps(candidate):null,publicKey};
}

async function checkForUpdate({ feedUrl, currentVersion, publicKey, fetchImpl = globalThis.fetch, timeoutMs = 8000 }) {
  if (!feedUrl||!releaseKey(publicKey)) return null;
  const safeFeed = safeHttps(feedUrl);
  if (!safeFeed) return null;
  const response = await fetchImpl(safeFeed, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(Math.max(1000, Math.min(20000, timeoutMs))),
  });
  if (!response.ok) return null;
  if(response.url&&!safeHttps(response.url))return null;
  if(Number(response.headers?.get('content-length'))>65536)return null;
  let text='';
  if(response.body?.getReader){const reader=response.body.getReader();let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return null;}chunks.push(Buffer.from(value));}text=Buffer.concat(chunks).toString('utf8');}finally{reader.releaseLock();}}
  else{text=await response.text();if(Buffer.byteLength(text)>65536)return null;}
  let data;try{data=JSON.parse(text);}catch{return null;}
  const update=verifyUpdateManifest(data,publicKey);
  return update&&isNewer(update.version,currentVersion)?update:null;
}

async function downloadUpdate(update,{directory,publicKey,fetchImpl=globalThis.fetch,onProgress=()=>{},signal}){
  update=verifyUpdateManifest(update,publicKey);
  if(!update)throw Error('更新发布签名无效');
  signal=signal?AbortSignal.any([signal,AbortSignal.timeout(600000)]):AbortSignal.timeout(600000);
  const folder=await fs.mkdtemp(path.join(directory,'okplay-update-'));
  const partial=path.join(folder,'update.part');
  const installer=path.join(folder,'OKPlay-Setup.exe');
  const limit=512*1024*1024;
  try{
    let url=update.url,response;
    for(let redirects=0;redirects<=5;redirects++){
      if(!safeHttps(url))throw Error('更新地址无效');
      response=await fetchImpl(url,{signal,redirect:'manual'});
      if(![301,302,303,307,308].includes(response.status))break;
      const location=response.headers.get('location');
      await response.body?.cancel();
      if(!location||redirects===5)throw Error('更新地址无法访问');
      url=new URL(location,url).href;
    }
    const total=Number(response.headers.get('content-length'))||0;
    if(response.status!==200||!response.body||total<0||total>limit)throw Error('更新包下载失败');
    let received=0,lastPercent=-1;
    const hash=createHash('sha256');
    const meter=new Transform({transform(chunk,_encoding,callback){
      received+=chunk.length;
      if(received>limit)return callback(Error('更新包超过大小限制'));
      hash.update(chunk);
      if(total){const percent=Math.min(99,Math.floor(received/total*100));if(percent!==lastPercent){lastPercent=percent;onProgress(percent);}}
      callback(null,chunk);
    }});
    await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(partial,{flags:'wx'}),{signal});
    if(!received||hash.digest('hex')!==update.sha256)throw Error('更新包校验失败');
    await fs.rename(partial,installer);
    onProgress(100);
    return installer;
  }catch(error){
    await fs.unlink(partial).catch(()=>{});
    await fs.rmdir(folder).catch(()=>{});
    throw error;
  }
}

async function verifyInstaller(installer,update,publicKey){
  const verified=verifyUpdateManifest(update,publicKey);
  if(!verified)throw Error('更新发布签名无效');
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(installer))hash.update(chunk);
  if(hash.digest('hex')!==verified.sha256)throw Error('更新包执行前校验失败');
}

async function launchInstaller(installer,{update,publicKey,spawnImpl=require('node:child_process').spawn}={}){
  await verifyInstaller(installer,update,publicKey);
  return new Promise((resolve,reject)=>{
    const child=spawnImpl(installer,['/S','--updated','--force-run','--keep-shortcuts'],{
      detached:true,stdio:'ignore',windowsHide:true
    });
    child.once('error',reject);
    child.once('spawn',()=>{child.unref();resolve();});
  });
}

module.exports={checkForUpdate,downloadUpdate,launchInstaller,verifyInstaller,verifyUpdateManifest,manifestPayload,updatePolicy,isNewer,parseVersion,safeHttps};
