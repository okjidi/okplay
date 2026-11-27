const fs=require('node:fs/promises');
const {fileResponse}=require('../desktop-service.cjs');
const path=require('node:path');
const origin='https://learn.okyolo.com';
const image='/test/cover.png';
const mine={id:'course-1',title:'接口课程甲',coverUrl:image,chapterCount:1,lessonCount:2,completedLessons:0,progressPercent:0};
const catalog={showAvailable:true,categories:[{id:'category-1',name:'服务端课程分类',courses:Array.from({length:8},(_,i)=>({id:'buy-'+(i+1),title:i?'接口可购课程'+(i+1):'接口可购课程',coverUrl:image,chapterCount:2,lessonCount:4,amount:99,intro:'服务端课程简介',purchaseUrl:'https://example.com/course'}))},{id:'category-2',name:'第二课程分类',courses:[{id:'other-1',title:'第二分类课程',coverUrl:image,chapterCount:1,lessonCount:3,amount:null,intro:'第二组简介'}]}]};
function createFixture(){
 const state={loggedIn:false,noVideos:false,noNotes:false,captcha:'off',fail:false,slow:false,calls:[],reports:[],released:0,openedUrls:[],orderStatus:'pending',payEnabled:true,paymentCreates:0};
 const kinds=['tool','source','effect','asset','platform'];
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 const handler=async(request,session)=>{
  const url=new URL(request.url),p=url.pathname;
  if(url.origin!==origin)return new Response('',{status:403});
  if(state.referenceRoot&&(p==='/__reference__/'||p.startsWith('/assets/')||['/login-bg.mp4','/ok-logo.webp','/favicon-v4.ico'].includes(p))){
   const file=path.resolve(state.referenceRoot,p==='/__reference__/'?'index.html':p.slice(1));
   if(!file.startsWith(path.resolve(state.referenceRoot)+path.sep))return new Response('',{status:403});
   try{return new Response(await fs.readFile(file),{headers:{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.mp4':'video/mp4','.ico':'image/x-icon'})[path.extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}
  }
  if(p.startsWith('/test/hls/'))return fileResponse(path.join(__dirname,'media',path.basename(p)),request.headers.get('Range'),{'Content-Type':p.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t'});
  if(p.startsWith('/test/'))return fileResponse(path.join(__dirname,'..','app','assets',p.endsWith('.mp4')?'demo.mp4':'cover0.png'),request.headers.get('Range'),{'Content-Type':p.endsWith('.mp4')?'video/mp4':'image/png'});
  state.calls.push({path:p,method:request.method,query:url.search});
  if(p==='/api/brand/logo')return new Response(await fs.readFile(path.join(__dirname,'..','app','assets','ok-logo.webp')),{headers:{'Content-Type':'image/webp'}});
  if(p==='/api/health')return json({ok:true});
  if(p==='/api/auth/captcha')return json(state.captcha==='off'?{enabled:false}:state.captcha==='text'?{enabled:true,kind:'text',id:'captcha-test',length:4,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60"><text x="20" y="40">TEST</text></svg>'}:{enabled:true,kind:'slider',id:'captcha-test',background:origin+image,piece:origin+image,aspect:2,pieceY:.2,pieceSize:.15,countdownSeconds:60});
  if(p==='/api/auth/login'){
   const data=await request.json();
   if(data.password!=='synthetic-password')return json({message:'账号或密码错误'},401);
   if(state.captcha==='text'&&data.captchaCode!=='TEST')return json({message:'验证码错误'},400);
   if(state.captcha==='slider'&&Math.abs(Number(data.captchaCode)-.4)>.03)return json({message:'验证码错误'},400);
   state.loggedIn=true;
   await session.cookies.set({url:origin,name:'fixture-session',value:'synthetic',httpOnly:true,secure:true,sameSite:'strict'});
   return json({account:{id:'test-account',username:'test-student',displayName:'验收学员'}});
  }
  if(p==='/api/auth/logout'){state.loggedIn=false;await session.cookies.remove(origin,'fixture-session');return new Response(null,{status:204});}
  if(p==='/api/contact'){if(state.contactDelay)await new Promise(r=>setTimeout(r,state.contactDelay));return json({settings:{qr1:image,hotline1:'10000',hotline2:'',email:'test@example.com',wechatId:'test'}});}
  if(!state.loggedIn)return json({message:'请先登录'},401);
  if(state.fail&&p.startsWith('/api/resources/'))return json({message:'资源暂时不可用'},503);
  if(p==='/api/auth/me')return json({account:{id:'test-account',username:'test-student',displayName:'验收学员',studentLevel:state.studentLevel}});
  const groups=kind=>[{id:kind+'-group-1',name:kind+'一级甲',subs:[{id:kind+'-sub-1',name:'二级甲',itemCount:20},{id:kind+'-sub-2',name:'二级乙',itemCount:1}]},{id:kind+'-group-2',name:kind+'一级乙',subs:[{id:kind+'-sub-3',name:'二级丙',itemCount:0}]}];
  if(p==='/api/bootstrap')return json({courses:Array.from({length:6},(_,i)=>({...mine,id:i?'course-'+(i+1):mine.id,title:i?'接口课程'+(i+1):mine.title,completedLessons:i===1?2:0,progressPercent:i===1?100:0,...(i===0?{difficulty:2}:{})})),videos:state.noVideos?[]:Array.from({length:7},(_,i)=>({id:'video-'+(i+1),title:i?'接口独立视频'+(i+1):'接口独立视频',coverUrl:image})),available:catalog,resources:Object.fromEntries(kinds.map(k=>[k,groups(k)]))});
  if(p==='/api/activation-codes/redeem'){const {code}=await request.json();return code==='TEST-CODE'?json({courseId:'course-1',courseTitle:'接口课程甲',granted:true}):json({message:'激活码无效'},400);}
  if(p==='/api/pay/channels')return json({wechat:state.payEnabled,alipay:false,currency:'CNY'});
  if(p==='/api/pay/orders'&&request.method==='POST'){state.paymentCreates++;return json({order:{orderNo:'test-order',status:'pending',courseId:'buy-1',courseTitle:'接口可购课程',amountCents:9900,channel:'wechat',codeUrl:'weixin://wxpay/bizpayurl?pr=synthetic',expiresAt:new Date(Date.now()+600000).toISOString()}});}
  if(p==='/api/pay/orders/test-order'){state.pollActive=(state.pollActive||0)+1;state.pollMax=Math.max(state.pollMax||0,state.pollActive);try{if(state.pollDelay)await new Promise(r=>setTimeout(r,state.pollDelay));return json({order:{orderNo:'test-order',status:state.orderStatus,courseTitle:'接口可购课程',amountCents:9900,codeUrl:'weixin://wxpay/bizpayurl?pr=synthetic',expiresAt:new Date(Date.now()+600000).toISOString()}});}finally{state.pollActive--;}}
  if(p==='/api/courses')return json({courses:[mine]});
  if(p==='/api/courses/available')return json(catalog);
  if(p==='/api/courses/course-1')return json({...mine,lecturer:'接口讲师',difficulty:3,notesDownloadUrl:state.noNotes?null:'https://example.com/course-notes 提取码 TEST',intro:'接口课程说明',chapters:[{id:'chapter-1',title:'接口章节',lessons:[{id:'lesson-1',title:'接口课时一',durationSeconds:30,completed:false,progressPercent:0},{id:'lesson-2',title:'接口课时二',durationSeconds:30,completed:false,progressPercent:0}]}]});
  const match=p.match(/^\/api\/resources\/(tool|source|effect|asset|platform)(.*)$/);
  if(match){
   const [,kind,tail]=match;
   if(!tail)return json({groups:groups(kind)});
   if(tail.startsWith('/sub/')){
    const id=decodeURIComponent(tail.slice(5)),total=id.endsWith('sub-1')?20:id.endsWith('sub-2')?1:0;
    if(state.slow&&id.endsWith('sub-1'))await new Promise(r=>setTimeout(r,250));
    const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||15);
    return json({total,items:Array.from({length:Math.max(0,Math.min(limit,total-offset))},(_,i)=>({id:kind+'-item-'+(offset+i),title:kind+'真实接口条目'+(offset+i),imageUrl:image}))});
   }
   if(tail==='/search')return json({items:url.searchParams.get('q')==='空结果'?[]:[{id:kind+'-item-0',title:kind+'搜索结果',imageUrl:image,subName:'搜索分类'}]});
   if(tail.startsWith('/item/'))return json({item:{id:tail.slice(6),title:kind+'接口详情',imageUrl:image,description:'<script>window.compromised=true</script>接口说明',downloadUrl:'https://example.com/resource'}});
  }
  if(p.endsWith('/playback'))return json({grantId:'test-grant',url:origin+(state.referenceRoot||state.hls?'/test/hls/demo.m3u8':'/test/video.mp4'),expiresAt:new Date(Date.now()+600000).toISOString()});
  if(p.endsWith('/notes'))return json({markdown:'# 生产接口笔记\n<script>window.compromised=true</script>'});
  if(p==='/api/progress'){state.reports.push(await request.json());if(state.rejectProgressOnce){state.rejectProgressOnce=false;await new Promise(r=>setTimeout(r,800));return json({message:'隔离旧课时进度失败'},500);}return new Response(null,{status:204});}
  if(p==='/api/playback/release'){state.released++;(state.releases||=[]).push(await request.json().catch(()=>null));return json({released:1});}
  if(p.endsWith('/heartbeat'))return json({renew:false});
  return json({message:'fixture endpoint missing'},404);
 };
 handler.state=state;return handler;
}
module.exports={createFixture};
