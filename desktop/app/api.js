(function(){
'use strict';
let sessionEpoch=0;
const active=new Set(),pending=new Map();
class ApiError extends Error{constructor(message,status=0,code){super(message);this.name='ApiError';this.status=status;this.code=code;}}
function validPath(path){if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||/[\\\s#]/.test(path))return false;try{return !path.split('?')[0].split('/').some(part=>{const value=decodeURIComponent(part);return value==='.'||value==='..'||/[\\/]/.test(value);});}catch{return false;}}
async function perform(path,{method='GET',body,signal,timeoutMs=20000}={}){
 const epoch=sessionEpoch,controller=new AbortController();active.add(controller);
 let timedOut=false,rejectAbort;
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
 const canceled=()=>new ApiError(epoch!==sessionEpoch?'请求所属会话已失效':timedOut?'请求超时，请稍后重试':'请求已取消',0,epoch!==sessionEpoch?'STALE_SESSION':timedOut?'TIMEOUT':'ABORTED');
 const check=()=>{if(epoch!==sessionEpoch||controller.signal.aborted)throw canceled();};
 const aborted=new Promise((_resolve,reject)=>{rejectAbort=()=>reject(canceled());controller.signal.addEventListener('abort',rejectAbort,{once:true});});
 if(signal?.aborted)controller.abort();
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},Math.max(1,Math.min(60000,Number(timeoutMs)||20000)));
 try{return await Promise.race([aborted,(async()=>{
  check();const response=await fetch('/api'+path,{method,credentials:'same-origin',signal:controller.signal,cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  let payload=null;if(response.status!==204){try{payload=await response.json();}catch{check();if(response.ok)throw new ApiError('服务返回了无法识别的数据',response.status,'INVALID_RESPONSE');}}
  check();if(!response.ok){if(response.status===401&&!['/auth/login','/auth/me'].includes(path))dispatchEvent(new Event('session-expired'));const error=new ApiError(payload?.message||('请求失败（HTTP '+response.status+'）'),response.status,payload?.code);const retry=Number(response.headers?.get('retry-after'));if(response.status===429&&Number.isFinite(retry)&&retry>0)error.retryAfterSeconds=Math.min(3600,retry);throw error;}return payload;
 })()]);}catch(error){if(error instanceof ApiError)throw error;check();throw new ApiError('无法连接课程服务，请检查网络后重试',0,'NETWORK');}
 finally{clearTimeout(timer);active.delete(controller);signal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',rejectAbort);}
}
function request(path,options={}){
 if(!validPath(path))return Promise.reject(new ApiError('接口路径无效',0,'INVALID_PATH'));
 const method=String(options.method||'GET').toUpperCase();if(!['GET','POST'].includes(method))return Promise.reject(new ApiError('不支持的请求方法',0,'INVALID_METHOD'));
 const shared=method==='GET'&&!options.signal&&path!=='/auth/captcha',key=sessionEpoch+':'+path;
 if(shared&&pending.has(key))return pending.get(key);
 const result=perform(path,{...options,method}).finally(()=>{if(pending.get(key)===result)pending.delete(key);});
 if(shared)pending.set(key,result);return result;
}
function invalidateSession(){sessionEpoch++;pending.clear();for(const controller of active)controller.abort();}
window.okplayApi={request,ApiError,invalidateSession};
})();
