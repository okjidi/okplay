const path = require('node:path');
const fs = require('node:fs/promises');
const {deviceIdentity}=require('./identity.cjs');

const ORIGIN = 'https://learn.okyolo.com';
const PREFIX = '/__okplay_desktop__/';
const ENTRY = ORIGIN + PREFIX + 'index.html';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' blob: https://vod.okyolo.com; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'";

function forwardOptions(request) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  const ownApi = url.origin === ORIGIN && url.pathname.startsWith('/api/');
  if (ownApi && !['GET','HEAD','OPTIONS'].includes(request.method)) {
    // 此专用 session 只加载 ENTRY 下的本地界面。Electron protocol Request
    // 不携带 Chromium 原始 Origin，主进程重新发出同源请求时须恢复它。
    // 已有的外域或 opaque Origin 一律拒绝；绝不为第三方接口补来源。
    const origin = headers.get('Origin');
    if (origin !== null && origin !== ORIGIN) return null;
    headers.set('Origin', ORIGIN);
  }
  return {bypassCustomProtocolHandlers:true,headers,...(ownApi?{credentials:'include'}:{})};
}

async function fileResponse(file, range, headers={}) {
  const bytes=await fs.readFile(file);
  if(!range)return new Response(bytes,{headers:{...headers,'Accept-Ranges':'bytes','Content-Length':String(bytes.length)}});
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  const invalid=()=>new Response(null,{status:416,headers:{'Content-Range':'bytes */'+bytes.length}});
  if(!match||(!match[1]&&!match[2]))return invalid();
  const start=match[1]?Number(match[1]):Math.max(0,bytes.length-Number(match[2]));
  const end=match[1]&&match[2]?Math.min(bytes.length-1,Number(match[2])):bytes.length-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=bytes.length)return invalid();
  return new Response(bytes.subarray(start,end+1),{status:206,headers:{...headers,'Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${bytes.length}`}});
}

async function localResponse(url, root, range) {
  let relative;
  try { relative = decodeURIComponent(new URL(url).pathname.slice(PREFIX.length)); }
  catch { return new Response('', {status:400}); }
  const target = path.resolve(root, relative);
  if (!relative || !target.startsWith(path.resolve(root) + path.sep)) return new Response('', {status:403});
  const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.mp4':'video/mp4'};
  if (!types[path.extname(target)]) return new Response('', {status:404});
  try {
    return await fileResponse(target,range,{'Content-Type':types[path.extname(target)],'Content-Security-Policy':CSP,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  } catch { return new Response('', {status:404}); }
}

async function installService(targetSession, {appRoot, userData, safeStorage, version, fixture, diagnostics}) {
  const deviceId=await deviceIdentity(userData,safeStorage);
  targetSession.webRequest.onBeforeSendHeaders({urls:[ORIGIN+'/*']}, (details, callback) => {
    const url = new URL(details.url);
    const headers = {...details.requestHeaders};
    if(diagnostics && url.pathname==='/api/auth/login') diagnostics({stage:'network',method:details.method,origin:headers.Origin||headers.origin||null,referer:headers.Referer||headers.referer||null,site:headers['Sec-Fetch-Site']||headers['sec-fetch-site']||null});
    if (url.origin === ORIGIN && url.pathname.startsWith('/api/')) {
      headers['X-OkPlay-Device'] = deviceId;
      headers['X-OkPlay-Client'] = 'okplay/' + version;
    }
    callback({requestHeaders:headers});
  });
  targetSession.protocol.handle('https', async request => {
    const url = new URL(request.url);
    if(diagnostics && url.pathname==='/api/auth/login') diagnostics({stage:'protocol',method:request.method,origin:request.headers.get('origin'),referer:request.headers.get('referer'),site:request.headers.get('sec-fetch-site')});
    if (url.origin === ORIGIN && url.pathname.startsWith(PREFIX)) return localResponse(request.url, path.join(appRoot, 'app'),request.headers.get('Range'));
    if (fixture) return fixture(request, targetSession);
    const options = forwardOptions(request);
    if (!options) return new Response(JSON.stringify({message:'请求来源不受信任'}),{status:403,headers:{'Content-Type':'application/json'}});
    return targetSession.fetch(request, options);
  });
}

module.exports = {ORIGIN, PREFIX, ENTRY, CSP, localResponse, installService, forwardOptions, fileResponse};
