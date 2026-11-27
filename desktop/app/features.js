(function(){
'use strict';
const definitions={hls:{path:'vendor/hls.min.js',global:'Hls'},qrcode:{path:'vendor/qrcode.min.js',global:'QRCode'}},pending=new Map();
function load(name){
 const entry=definitions[name];if(!entry)return Promise.reject(new Error('未知功能模块'));
 if(window[entry.global])return Promise.resolve(window[entry.global]);if(pending.has(name))return pending.get(name);
 const promise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.dataset.feature=name;script.src=entry.path;script.async=true;let settled=false;
 const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){script.remove();reject(error);}else resolve(window[entry.global]);};
 const timer=setTimeout(()=>finish(new Error('功能模块加载超时，请重试')),15000);
 script.onload=()=>finish(window[entry.global]?null:new Error('功能模块未能正确加载，请重试'));
 script.onerror=()=>finish(new Error('功能模块加载失败，请重试'));document.head.appendChild(script);
 }).catch(error=>{pending.delete(name);throw error;});pending.set(name,promise);return promise;
}
window.okplayFeatures={load};
})();
