(function(){
'use strict';
const api=window.okplayApi.request;
const pages=[['home','学习中心',0],['catalog','全部课程',1],['tools','软件/工具',2],['source','源码/模版',3],['ui','UI/特效/素材',4],['ai','AI 平台',5],['models','大模型/Git平台',6]];
const kinds={tools:'tool',source:'source',ui:'effect',ai:'asset',models:'platform'};
const eyebrows={tools:'TOOLS',source:'SOURCE',ai:'PLATFORMS',models:'MODELS / GIT'};
const stage=document.querySelector('#stage'),modal=document.querySelector('#modal');
const pageBackdrop=document.createElement('div');pageBackdrop.className='page-background';pageBackdrop.setAttribute('aria-hidden','true');pageBackdrop.innerHTML='<video src="assets/login-bg.mp4" autoplay muted loop playsinline preload="auto"></video>';
let page='loading',account=null,data=null,course=null,currentLesson=null,currentVideo=null,viewSeq=0;
const baseResourceLimit=()=>innerWidth<800?9:18;
let groups=[],primary=0,secondary=0,resourcePage=0,resourceLimit=baseResourceLimit(),resourceItems=[],resourceTotal=0,resourceLoading=false,resourceError='';
let pickedCourse=null,payTimer=null,paySeq=0,paymentCreating=false,payPollAbort=null;
const pendingPaymentOrders=new Map();
let catalogGroup=0,catalogQuery='',searchTimer,searchSeq=0,loginBusy=false,authSubmitting=false,captcha=null,captchaTimer,captchaCountdownTimer,captchaCredentials=null,externalUrl='';
let controls=null,media=null,hls=null,grant=null,heartbeat=null,progressSequence=0,playerEpoch=0,playerError='',notes='',rate=1,muted=false;
let navHistory=[],navIndex=-1,navRestoring=false;
let appVersion='';
let remembered='';try{remembered=localStorage.getItem('production-account')||'';localStorage.removeItem('preview-session');}catch{}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const btn=(label,action,cls='btn')=>`<button class="${cls}" data-action="${esc(action)}">${label}</button>`;
const asset=(name,cls='',alt='')=>`<img class="${cls}" src="assets/${name}.png" alt="${esc(alt)}">`;
const brand=cls=>`<img class="${cls}" src="/api/brand/logo" alt="OK基地" data-brand>`;
const nameOf=id=>pages.find(p=>p[0]===id)?.[1]||id;
const encode=encodeURIComponent;
const safeUrl=value=>{try{const u=new URL(value,location.origin);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const picture=(url,cls='',alt='',options={})=>{const full=url&&safeUrl(url);if(!full)return `<span class="image-placeholder ${cls}" aria-label="暂无封面"></span>`;const small=options.small||((url.startsWith('/uploads/covers/')&&url.endsWith('.webp'))?url.slice(0,-5)+'-320.webp':null);return `<img class="${cls}" src="${esc(full)}" ${small&&safeUrl(small)?`srcset="${esc(safeUrl(small))} 320w, ${esc(full)} 640w" sizes="(min-width:1100px) 240px, 45vw" data-fallback-src="${esc(full)}"`:''} alt="${esc(alt)}" loading="${options.eager?'eager':'lazy'}" decoding="async" ${options.eager?'fetchpriority="high"':''}>`;};
const percent=n=>Math.max(0,Math.min(100,Number(n)||0));
const bar=n=>`<div class="bar" role="progressbar" aria-valuenow="${percent(n)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${percent(n)}%"></i></div>`;
const time=n=>{n=Math.max(0,Math.floor(Number(n)||0));return `${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`;};
const errorView=(message,action='retry')=>`<div class="status-error" role="alert"><p>${esc(message)}</p>${btn('重试',action,'btn outline')}</div>`;
const crumb=title=>`<div class="crumb">${btn('学习中心','go:home','plain')} <span>/</span> ${esc(title)}</div>`;
const searchInput=(placeholder,id='')=>`<label class="search"><i></i><input ${id?`id="${id}"`:''} type="search" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></label>`;
const searchButton=(label,action)=>`<button class="search search-button" data-action="${esc(action)}" aria-label="${esc(label)}"><i></i><span>${esc(label)}</span></button>`;
const allLessons=()=>course?.chapters?.flatMap(ch=>ch.lessons)||[];
function chapters(){return (course?.chapters||[]).map(ch=>`<details class="chapter" open><summary><span>${esc(ch.title)}</span><small>${ch.lessons.length} 课时</small></summary>${ch.lessons.map((l,i)=>`<button class="lesson ${currentLesson?.id===l.id?'chosen':''}" data-action="lesson:${esc(l.id)}"><span>${String(i+1).padStart(2,'0')}</span><span>${esc(l.title)}</span><small>${time(l.durationSeconds)}</small><i class="${l.completed?'done':'ring'}">${l.completed?'✓':''}</i></button>`).join('')}</details>`).join('');}
function fitAccountLabel(){
 const el=document.querySelector('.sidebar .account>span');
 if(!el)return;
 el.style.fontSize='';
 const base=parseFloat(getComputedStyle(el).fontSize)||17;
 let size=base;
 while(el.scrollWidth>el.clientWidth&&size>7){size-=0.5;el.style.fontSize=size+'px';}
}
function sidebar(){const current=kinds[page]||page==='catalog'?page:'home';return `<aside class="sidebar"><nav>${pages.map(([id,title,icon])=>`<button class="navitem ${current===id?'selected':''}" data-action="go:${id}" ${current===id?'aria-current="page"':''}>${asset('nav'+icon,'navicon')}${title}</button>`).join('')}</nav><button class="account" data-action="account">${asset('avatar','avatar')}<span>${esc(account?.studentLevel?.name?.trim()||account?.displayName||account?.username||'我的账号')}</span><span class="chev"></span></button></aside>`;}
function login(){return `<div class="login"><video class="login-background" src="assets/login-bg.mp4" autoplay muted loop playsinline preload="auto" aria-hidden="true"></video><div class="login-brandbar">${brand('login-brand')}<span>You Only Live Once！人生只有一次，放手干吧！OK yolo!</span></div><div class="login-panel"><form id="login" class="legacy-login-card" novalidate><h1><span class="welcome">WELCOME</span>·欢迎来到ok学院</h1><p class="login-intro">⚠️不支持注册，请联系客服获取【专属账号】</p><div class="auth-field"><label for="account">专属账号：</label><input id="account" name="account" required maxlength="128" inputmode="numeric" pattern="[0-9]*" autocomplete="username" placeholder="请输入用户名" value="${esc(remembered)}"></div><div class="auth-field"><label for="password">密码：</label><input id="password" name="password" required maxlength="512" type="password" autocomplete="current-password" placeholder="请输入密码"></div><label class="remember"><input type="checkbox" name="remember" ${remembered?'checked':''}>记住账号</label><button type="submit" class="btn primary">登录</button>${btn('申请账号','support','btn login-apply')}<p id="login-error" role="status" aria-live="polite"></p><p class="login-hint">手机/平板：[微信小程序] 搜索【ok基地】</p></form></div><p class="login-footer">©ok基地2026 版权所有。 <button data-action="legal:icp">蜀ICP备2026044086号</button> <button data-action="legal:police">川公网安备51011402001125号</button> ICP增值电信业务经营许可证川B2-20230509 · 商标号：第42类 93966283 ·《出版物经营许可证》新出发蓉零字第CH-B5354号</p></div>`;}
function mineCard(c,index=0){
 const completed=c.lessonCount>0&&c.completedLessons>=c.lessonCount;
 const level=Math.min(5,Math.max(0,Math.round(Number(c.difficulty)||0)));
 return `<button class="pane mine-card" data-action="owned:${esc(c.id)}"><span class="mine-cover">${picture(c.coverUrl,'',c.title,{small:c.coverUrlSmall,eager:index===0})}</span><h3>${esc(c.title)}</h3><div class="mine-meta"><span>${esc(c.lessonCount)} 课时</span><span class="${completed?'course-completed':''}">${completed?'已完成':`${esc(c.completedLessons)}/${esc(c.lessonCount)}已学·${percent(c.progressPercent)}%`}</span></div>${level?`<span class="difficulty" role="img" aria-label="难易度 ${level} 星，共 5 星"><span>难易度</span><span class="filled-stars">${'★'.repeat(level)}</span><span class="empty-stars">${'★'.repeat(5-level)}</span></span>`:''}${bar(c.progressPercent)}</button>`;
}
function home(){
 if(!data)return '<div class="content"><p>正在载入学习中心…</p></div>';
 return `<div class="home content"><div class="home-head"><span class="detail-eyebrow">LEARNING</span><h1>学习中心</h1>${btn('激活课程','activate','btn toolbar-blue')}${searchButton('搜索我的课程','home-search')}${btn('在线咨询','support','btn toolbar-consult')}</div><div class="section-title mine-heading"><h2>我的课程</h2><span class="authorization-tag">已授权</span></div><div class="mine-grid">${data.courses.map(mineCard).join('')||'<p class="empty">当前账号还没有已授权的课程。请联系课程管理员确认。</p>'}</div>${data.videos.length?`<section class="standalone-section"><h2>其他教程</h2><div class="standalone-grid">${data.videos.map(v=>`<button class="pane standalone-card" data-action="standalone:${esc(v.id)}"><span class="standalone-cover">${picture(v.coverUrl,'',v.title,{small:v.coverUrlSmall})}</span><h3>${esc(v.title)}</h3></button>`).join('')}</div></section>`:''}</div>`;
}
function catalogCard(c){const level=Math.min(5,Math.max(0,Math.round(Number(c.difficulty)||0)));return `<button class="pane catalog-card" data-action="buy:${esc(c.id)}"><span class="catalog-cover">${picture(c.coverUrl,'',c.title,{small:c.coverUrlSmall})}<span class="catalog-lesson-count">${esc(c.lessonCount)} 课时</span></span><h3>${esc(c.title)}</h3><span class="catalog-meta">${c.amount==null?'':`<span class="catalog-price">¥${Number(c.amount).toLocaleString('zh-CN',{maximumFractionDigits:2})}</span>`}${level?`<span class="difficulty" role="img" aria-label="难易度 ${level} 星，共 5 星"><span>难易度</span><span class="filled-stars">${'★'.repeat(level)}</span><span class="empty-stars">${'★'.repeat(5-level)}</span></span>`:''}</span></button>`;}
function catalogCards(){
 const categories=data?.available?.categories||[];
 // 全部课程默认展示每一组的全部课程，不再提供“显示全部 / 收起”。
 return categories.map((group,i)=>{const rows=group.courses.filter(c=>c.title.toLowerCase().includes(catalogQuery.toLowerCase()));if(!rows.length)return '';return `<section id="catalog-section-${i}" class="catalog-group-section"><h2>${esc(group.name)}</h2><div class="catalog-grid">${rows.map(catalogCard).join('')}</div></section>`;}).join('')||'<p class="empty">没有找到匹配的课程</p>';
}
function catalog(){const cats=data?.available?.categories||[],open=data?.available?.showAvailable;return `<div class="catalog content"><div class="catalog-head">${open?`<nav class="filters" aria-label="课程分类">${cats.map((c,i)=>btn(esc(c.name),'catalog-group:'+i,'btn toolbar-blue')).join('')}</nav>`:''}${searchInput('搜索全部课程','catalog-query')}${btn('在线咨询','support','btn toolbar-consult')}</div>${open?`<div id="results">${catalogCards()}</div>`:'<p class="empty">管理员暂未开放全部课程，已授权课程可在学习中心查看。</p>'}</div>`;}
function detail(){
 const level=Math.min(5,Math.max(0,Math.round(Number(course.difficulty)||0)));
 const lessons=allLessons();
 return `<div class="detail content"><section class="pane course-overview"><div class="course-cover-column"><div class="detail-cover">${picture(course.coverUrl,'',course.title)}</div>${String(course.notesDownloadUrl||'').trim()?btn('📂　课程笔记下载','notes-download','btn outline notes-download'):''}</div><div class="course-information"><div class="detail-section-heading"><span class="detail-eyebrow">COURSE</span><h1>${esc(course.title)}</h1></div><dl class="course-kv"><div><dt>主讲</dt><dd>${esc(course.lecturer||'—')}</dd></div><div><dt>章节</dt><dd>${esc(course.chapterCount)}</dd></div><div><dt>总课时</dt><dd>${esc(course.lessonCount)}</dd></div><div><dt>已完成</dt><dd>${esc(course.completedLessons)}</dd></div></dl>${bar(course.progressPercent)}<p class="course-progress">学习进度 ${percent(course.progressPercent)}%</p>${course.intro?`<div class="course-introduction"><div class="detail-section-heading"><span class="detail-eyebrow">ABOUT</span><h2>课程简介</h2></div><p>${esc(course.intro)}</p></div>`:''}${level?`<span class="difficulty detail-difficulty" role="img" aria-label="难易度 ${level} 星，共 5 星"><span>难易度</span><span class="filled-stars">${'★'.repeat(level)}</span><span class="empty-stars">${'★'.repeat(5-level)}</span></span>`:''}</div></section><section class="pane course-lesson-section"><div class="detail-section-heading"><span class="detail-eyebrow">LESSONS</span><h2>课程章节</h2></div><ol class="detail-lessons">${lessons.map(l=>`<li><button class="detail-lesson" data-action="lesson:${esc(l.id)}"><span class="lesson-status ${l.completed?'course-completed':''}">${l.completed?'已完成':percent(l.progressPercent)>0?'已学 '+percent(l.progressPercent)+'%':'未开始'}</span><span class="detail-lesson-title">${esc(l.title)}</span>${bar(l.progressPercent)}</button></li>`).join('')||'<li class="empty">暂无课时</li>'}</ol></section></div>`;
}
function openCourseNotes(){
 const raw=String(course?.notesDownloadUrl||'').trim();if(!raw)return;
 showModal('课程笔记下载',`<p>点“去下载”将在系统浏览器打开网盘地址。提取码保留在下方，也可手动复制。</p><textarea id="notes-url" class="download-address" readonly aria-label="课程笔记下载地址">${esc(raw)}</textarea><p id="notes-download-error" role="alert"></p>`,btn('去下载','notes-open','btn primary'));
}
function resourceCards(items){return `<div class="resource-grid">${items.map(item=>`<button class="pane resource-card" data-action="resource:${esc(item.id)}"><span class="resource-cover material-cover">${picture(item.imageUrl,'',item.title)}</span><h3>${esc(item.title)}</h3></button>`).join('')}</div>`;}
function resourceResults(){if(resourceLoading)return '<p class="empty" role="status">正在载入资源…</p>';if(resourceError)return errorView(resourceError);if(!resourceItems.length)return '<p class="empty">当前二级目录下还没有内容</p>';const max=Math.ceil(resourceTotal/resourceLimit);return resourceCards(resourceItems)+(max>1?`<div class="resource-pagination">${resourcePage>0?btn('上一页','resource-prev'):''}<span>${resourcePage+1} / ${max} 页 · ${resourceTotal} 条</span>${resourcePage+1<max?btn('下一页','resource-next'):''}</div>`:'');}
function resources(){const selected=groups[primary],subs=selected?.subs||[];return `<div class="resource content ${page}"><div class="resource-level resource-level-primary">${eyebrows[page]?`<span class="resource-eyebrow">${eyebrows[page]}</span>`:""}<h1 class="level-label" aria-label="${nameOf(page)}">一级目录&gt;&gt;</h1><nav aria-label="一级目录">${groups.map((g,i)=>`<button class="directory-button ${i===primary?'is-selected':''}" data-action="resource-primary:${i}" aria-pressed="${i===primary}">${esc(g.name)}</button>`).join('')}</nav>${searchButton('搜索'+nameOf(page),'resource-search')}${btn('在线咨询','support','btn toolbar-consult')}</div><div class="resource-level resource-level-secondary"><span class="level-label">二级目录&gt;&gt;</span><nav aria-label="二级目录">${subs.map((sub,i)=>`<button class="directory-button ${i===secondary?'is-selected':''}" data-action="resource-secondary:${i}" aria-pressed="${i===secondary}">${esc(sub.name)}</button>`).join('')}</nav></div><div id="results">${resourceResults()}</div></div>`;}
function player(){const item=currentVideo||currentLesson,chaptersPanel=currentVideo?'':`<aside class="pane player-chapters"><h2>当前课程</h2><div class="player-chapter-list">${chapters()}</div></aside>`;return `<div class="player content"><div class="player-head">${crumb(currentVideo?'独立视频':course.title)}<h1>${esc(item.title)}</h1></div><div class="player-grid${currentVideo?' no-chapters':''}"><section class="pane video-pane"><div class="poster"><video id="video" controls playsinline preload="metadata"></video></div>${window.playerControlsMarkup()}<p id="player-status" role="status">${playerError?esc(playerError):'正在申请播放授权…'}</p></section>${chaptersPanel}</div><section class="notes pane"><h2>${currentVideo?'视频简介':'课堂笔记'}</h2><div class="lesson-notes">${window.renderNotes(notes||'正在载入…')}</div></section>${playerError?errorView(playerError,'retry-player'):''}${currentVideo?'':`<div class="player-foot">${btn('返回课程','owned:'+course.id,'btn')}${allLessons().findIndex(l=>l.id===currentLesson?.id)<allLessons().length-1?btn('下一课　›','next-lesson','btn primary'):'<span class="last-lesson">已是最后一课</span>'}</div>`}</div>`;}
function resize(){document.documentElement.style.setProperty('--window-scale',1);}
const viewSnapshot=()=>page==='player'?{page,courseId:course?.id||null,lessonId:currentLesson?.id||null,videoId:currentVideo?.id||null}:page==='detail'?{page,courseId:course?.id||null}:{page,courseId:null,lessonId:null,videoId:null};
const sameView=(a,b)=>['page','courseId','lessonId','videoId'].every(k=>a[k]===b[k]);
function updateArrows(){const back=document.querySelector('[data-nav="back"]'),forward=document.querySelector('[data-nav="forward"]');if(!back||!forward)return;back.disabled=navRestoring||navIndex<=0;forward.disabled=navRestoring||navIndex>=navHistory.length-1;}
function recordView(){if(navRestoring||page==='login'||page==='loading')return;if(page==='detail'&&!course)return;if(page==='player'&&!currentLesson&&!currentVideo)return;const snap=viewSnapshot();if(navIndex>=0&&sameView(navHistory[navIndex],snap))return;navHistory=navHistory.slice(0,navIndex+1);navHistory.push(snap);navIndex=navHistory.length-1;updateArrows();}
async function restoreView(s){if(s.page==='player'){if(s.videoId){const v=(data?.videos||[]).find(x=>x.id===s.videoId);if(v){await openPlayer(v,true);return;}}if(s.lessonId&&s.courseId){const result=await api('/courses/'+encode(s.courseId));course=result;const lesson=(course.chapters||[]).flatMap(ch=>ch.lessons).find(x=>x.id===s.lessonId);if(lesson){await openPlayer(lesson);return;}}}if(s.page==='detail'&&s.courseId){await openCourse(s.courseId);return;}await navigate(s.page);}
async function refreshView(){await restoreView(viewSnapshot());}
async function goHistory(delta){if(navRestoring)return;const target=navIndex+delta;if(target<0||target>=navHistory.length)return;navIndex=target;navRestoring=true;updateArrows();try{await restoreView(navHistory[target]);}finally{navRestoring=false;updateArrows();}}
function render(){pageBackdrop.remove();stage.innerHTML=page==='login'?login():page==='loading'?'<main class="boot-screen"><p>正在连接课程服务…</p></main>':sidebar()+`<main>${page==='home'?home():page==='catalog'?catalog():page==='detail'&&course?detail():page==='player'?player():kinds[page]?resources():'<div class="content">正在载入…</div>'}</main>`;if(account&&page!=='login'&&page!=='loading'){stage.prepend(pageBackdrop);pageBackdrop.querySelector('video').play().catch(()=>{});}else pageBackdrop.querySelector('video').pause();resize();fitAccountLabel();recordView();}
function stopPaymentPolling(){clearTimeout(payTimer);payTimer=null;payPollAbort?.abort();payPollAbort=null;}
function showModal(title,body,actions='',style=''){stopPaymentPolling();paySeq++;modal.className=style;modal.innerHTML=`<h2>${esc(title)}</h2><div class="modal-body">${body}</div><div>${actions}${btn('关闭','dismiss')}</div>`;if(!modal.open)modal.showModal();}
function resetSession(){pendingPaymentOrders.clear();window.okplayApi.invalidateSession();viewSeq++;searchSeq++;account=null;navHistory=[];navIndex=-1;data=null;groups=[];course=null;captchaCredentials=null;stopPlayback(true);modal.close();page='login';render();}
addEventListener('session-expired',resetSession);
function loginError(message){const el=document.querySelector('#login-error');if(el)el.textContent=message;}
function setLoginBusy(value){loginBusy=value;const submit=document.querySelector('#login [type=submit]');if(submit){submit.disabled=value;submit.textContent=value?'正在登录…':'登录';}}
function closeCaptcha(){clearTimeout(captchaTimer);clearInterval(captchaCountdownTimer);captcha=null;captchaCredentials=null;modal.close();setLoginBusy(false);}
async function submitLogin(code=''){
 if(!captchaCredentials||authSubmitting)return;authSubmitting=true;setLoginBusy(true);const credentials=captchaCredentials,id=captcha?.id||'';
 try{
  const result=await api('/auth/login',{method:'POST',body:{username:credentials.username,password:credentials.password,captchaId:id,captchaCode:code}});
  account=result.account;try{if(credentials.remember)localStorage.setItem('production-account',credentials.username);else localStorage.removeItem('production-account');}catch{}
  remembered=credentials.remember?credentials.username:'';captchaCredentials=null;captcha=null;clearTimeout(captchaTimer);clearInterval(captchaCountdownTimer);modal.close();document.querySelector('#login [name=password]').value='';await navigate('home');
 }catch(error){if(error.status===400&&captcha?.enabled&&captchaCredentials){try{const next=await api('/auth/captcha');if(next.enabled){clearTimeout(captchaTimer);clearInterval(captchaCountdownTimer);captcha=next;openCaptcha(error.message);return;}}catch{}}closeCaptcha();const input=document.querySelector('#login [name=password]');if(input)input.value='';loginError(error.message);}
 finally{authSubmitting=false;setLoginBusy(false);}
}
async function startLogin(form){if(loginBusy)return;const fd=new FormData(form);if(!String(fd.get('account')).trim()||!String(fd.get('password'))){loginError('请输入账号和密码');return;}captchaCredentials={username:String(fd.get('account')).trim(),password:String(fd.get('password')),remember:fd.has('remember')};setLoginBusy(true);loginError('');try{captcha=await api('/auth/captcha');if(!captcha.enabled){await submitLogin();return;}openCaptcha();}catch(error){captchaCredentials=null;loginError(error.message);setLoginBusy(false);}}
function openCaptcha(message=''){
 let content='';if(captcha.kind==='text')content=`<img class="text-captcha" src="data:image/svg+xml,${esc(encode(captcha.svg))}" alt="验证码"><label>验证码<input id="captcha-code" autocomplete="off" maxlength="${Number(captcha.length)||8}"></label>`;
 else content=`<div class="captcha-puzzle" role="slider" tabindex="0" aria-label="拖动拼图到缺口，或用左右方向键移动、回车提交" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-disabled="false" style="aspect-ratio:${Number(captcha.aspect)||2}"><img src="${esc(captcha.background)}" alt="验证码底图" draggable="false"><img id="captcha-piece" src="${esc(captcha.piece)}" alt="拼图块" draggable="false" style="top:${Number(captcha.pieceY)*100}%;width:${Number(captcha.pieceSize)*100}%"></div><p class="captcha-hint">直接拖动拼图块到缺口，松手后自动验证。</p>`;
 showModal('图形验证码',`${message?'<p class="captcha-error" role="alert">'+esc(message)+'</p>':''}${captcha.kind==='slider'?'<p class="captcha-countdown">还剩 <b id="captcha-remaining">'+Number(captcha.countdownSeconds)+'</b> 秒 — 拖到位就自动登录</p>':''}${content}`);
 if(captcha.kind==='slider'){
  window.bindPuzzleCaptcha(document.querySelector('.captcha-puzzle'),{pieceSize:Number(captcha.pieceSize),isDisabled:()=>authSubmitting||!captchaCredentials||captcha?.kind!=='slider',onDrop:ratio=>{void submitLogin(String(ratio));}});
  const expires=Date.now()+Math.max(1,Number(captcha.countdownSeconds))*1000;captchaCountdownTimer=setInterval(()=>{const counter=document.querySelector('#captcha-remaining');if(counter)counter.textContent=String(Math.max(0,Math.ceil((expires-Date.now())/1000)));},1000);
  captchaTimer=setTimeout(()=>{closeCaptcha();loginError('验证超时，请重新登录');},Math.max(1,Number(captcha.countdownSeconds))*1000);
  document.querySelector('.captcha-puzzle').focus();
 }else document.querySelector('#captcha-code')?.focus();
}
async function bootstrap(){return api('/bootstrap');}
async function navigate(target){
 await stopPlayback();const seq=++viewSeq;page=target;playerError='';
 if(target==='home'){render();try{const result=await bootstrap();if(seq===viewSeq){data=result;render();}}catch(error){if(seq===viewSeq&&page!=='login')stage.querySelector('main').innerHTML='<div class="content">'+errorView(error.message,'refresh-home')+'</div>';}return;}
 if(target==='catalog'){catalogGroup=0;catalogQuery='';render();return;}
 if(kinds[target]){primary=secondary=resourcePage=0;resourceLimit=baseResourceLimit();groups=[];resourceItems=[];resourceLoading=true;resourceError='';render();try{const result=await api('/resources/'+kinds[target]);if(seq!==viewSeq)return;groups=result.groups;await loadResourceItems();}catch(error){if(seq===viewSeq){resourceLoading=false;resourceError=error.message;render();}}return;}
 render();
}
let resourceFitting=false;
async function fitResourceToScreen(){
 if(resourceFitting||!kinds[page])return;resourceFitting=true;
 try{
  const grid=document.querySelector('.resource-grid'),main=document.querySelector('main');
  if(!grid||!main)return;
  const cols=getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length||1;
  // 高度 >= 800（内容区可视高度）放 3 行，否则 2 行；始终只在这两档之间。
  const rows=main.clientHeight>=800?3:2;
  const limit=cols*rows;
  if(limit!==resourceLimit){resourceLimit=limit;resourcePage=0;await loadResourceItems();}
 }finally{resourceFitting=false;}
}
async function loadResourceItems(){const seq=++viewSeq,module=page,sub=groups[primary]?.subs?.[secondary];resourceLoading=true;resourceError='';resourceItems=[];render();if(!sub){resourceLoading=false;render();return;}try{const result=await api(`/resources/${kinds[module]}/sub/${encode(sub.id)}?limit=${resourceLimit}&offset=${resourcePage*resourceLimit}`);if(seq!==viewSeq||page!==module)return;resourceItems=result.items;resourceTotal=result.total;resourceLoading=false;const _m=document.querySelector('main');if(_m)_m.scrollTop=0;render();if(!resourceFitting)requestAnimationFrame(()=>void fitResourceToScreen());}catch(error){if(seq===viewSeq&&page===module){resourceLoading=false;resourceError=error.message;render();}}}
async function openCourse(id){await stopPlayback();const seq=++viewSeq;page='detail';course=null;render();try{const result=await api('/courses/'+encode(id));if(seq!==viewSeq)return;course=result;render();}catch(error){if(seq===viewSeq&&page!=='login')stage.querySelector('main').innerHTML='<div class="content">'+errorView(error.message,'owned:'+id)+'</div>';}}
function openResourceSearch(){modal.className='resource-search-modal';modal.innerHTML=`<h2>搜索${nameOf(page)}</h2>${searchInput('搜索当前模块的全部资源','resource-query')}<div id="resource-search-results"><p class="empty">输入关键词，搜索当前模块全部资源</p></div><div>${btn('关闭','dismiss')}</div>`;modal.showModal();document.querySelector('#resource-query').focus();}
async function searchResources(query){const seq=++searchSeq,module=page,resultEl=document.querySelector('#resource-search-results');if(!query.trim()){resultEl.innerHTML='<p class="empty">输入关键词，搜索当前模块全部资源</p>';return;}resultEl.innerHTML='<p class="empty">正在搜索…</p>';try{const result=await api(`/resources/${kinds[module]}/search?q=${encode(query.trim())}&limit=30`);if(seq!==searchSeq||!modal.open||page!==module||!document.querySelector('#resource-search-results'))return;resultEl.innerHTML=result.items.length?resourceCards(result.items):'<p class="empty">没有找到匹配的资源</p>';}catch(error){if(seq===searchSeq&&modal.open&&document.querySelector('#resource-search-results'))resultEl.innerHTML=errorView(error.message,'search-retry');}}
async function openResource(id){
 const seq=++searchSeq,module=page;showModal('资源详情','<p>正在载入…</p>');const modalToken=paySeq;
 try{const {item}=await api(`/resources/${kinds[module]}/item/${encode(id)}`);if(seq!==searchSeq||page!==module||!modal.open||modalToken!==paySeq)return;
 externalUrl=safeUrl((item.downloadUrl||'').trim().split(/\s+/)[0]);
 showModal(item.title,`<div class="resource-detail-layout"><div>${picture(item.imageUrl,'resource-detail-image')}</div><div><p class="resource-description">${esc(item.description||'暂无说明')}</p><textarea class="download-address" readonly aria-label="资源获取地址">${esc(item.downloadUrl||'')}</textarea><p class="external-error" role="alert"></p></div></div>`,btn('获取','external','btn primary'),'resource-detail-modal');
 }catch(error){if(seq===searchSeq&&modal.open&&modalToken===paySeq)showModal('资源详情',errorView(error.message,'resource:'+id));}
}
function buyCourse(id){const item=data.available.categories.flatMap(c=>c.courses).find(c=>c.id===id);if(!item)return;pickedCourse=item;externalUrl=safeUrl(item.purchaseUrl||'');showModal(item.title,`<div class="resource-detail-layout"><div>${picture(item.coverUrl,'resource-detail-image')}</div><div><p class="purchase-price">${item.amount==null?'':'¥ '+Number(item.amount).toFixed(2)}</p><p class="subtle">${item.chapterCount} 章 · ${item.lessonCount} 课时${item.difficulty?' · 难易度 '+Number(item.difficulty)+' 星':''}</p><p class="resource-description">${esc(item.intro||'暂无课程简介')}</p><p class="purchase-notice">未获得该课程授权<br>请扫码购买或联系客服</p><p class="external-error" role="alert"></p></div></div>`,(Number(item.amount)>0?btn('微信扫码购课','pay-wechat','btn primary')+btn('支付宝购课','pay-alipay','btn outline'):'')+btn('在线客服购买','support','btn outline'),'resource-detail-modal');}
async function startPayment(channel='wechat'){
 const item=pickedCourse;if(paymentCreating||!item||!(Number(item.amount)>0))return;
 paymentCreating=true;
 const owner=account?.id,key=owner+':'+item.id;
 const title=channel==='alipay'?'支付宝扫码支付':'微信扫码支付';
 showModal(title,'<p>正在生成支付订单…</p>');
 const seq=paySeq;
 try{
  const channels=await api('/pay/channels');
  if(seq!==paySeq||!modal.open)return;
  if(!channels[channel]){showModal(title,`<p>暂未开通${channel==='alipay'?'支付宝':'微信'}支付，请联系客服购买。</p>`,btn('在线咨询','support','btn outline'));return;}

  if(channel==='alipay'){
   const QRCodeLibrary=await window.okplayFeatures.load('qrcode');if(seq!==paySeq||!modal.open)return;
   const result=await api('/pay/orders',{method:'POST',body:{courseId:item.id,channel:'alipay'}});
   if(seq!==paySeq||!modal.open||account?.id!==owner)return;
   const order=result.order;
   if(order.status==='pending')pendingPaymentOrders.set(key,order);else pendingPaymentOrders.delete(key);
   if(order.status==='pending'&&(!order.qrCode||order.qrCode.length>4096))throw new Error('二维码数据异常，请联系客服确认订单');
   const image=order.status==='pending'?await QRCodeLibrary.toDataURL(order.qrCode,{width:240,margin:2}):'';
   if(seq!==paySeq||!modal.open)return;
   showAlipayPayment(order,image);
   if(order.status!=='pending'){if(order.status==='paid')data=await bootstrap();return;}
   startPaymentPolling(order,key,owner,paySeq,'alipay');
   return;
  }

  const QRCodeLibrary=await window.okplayFeatures.load('qrcode');if(seq!==paySeq||!modal.open)return;
  let order=pendingPaymentOrders.get(key);
  if(order&&order.status==='pending'&&Date.parse(order.expiresAt)>Date.now()&&order.channel==='wechat')order=(await api('/pay/orders/'+encode(order.orderNo))).order;
  else order=(await api('/pay/orders',{method:'POST',body:{courseId:item.id,channel:'wechat'}})).order;
  if(order.status==='pending')pendingPaymentOrders.set(key,order);else pendingPaymentOrders.delete(key);
  if(seq!==paySeq||!modal.open||account?.id!==owner)return;
  if(order.status==='pending'&&(!order.codeUrl||order.codeUrl.length>4096))throw new Error('二维码数据异常，请联系客服确认订单');
  const image=order.status==='pending'?await QRCodeLibrary.toDataURL(order.codeUrl,{width:240,margin:2}):'';
  if(seq!==paySeq||!modal.open)return;
  showPayment(order,image);
  if(order.status!=='pending'){if(order.status==='paid')data=await bootstrap();return;}
  startPaymentPolling(order,key,owner,paySeq,'wechat');
 }catch(error){if(seq===paySeq&&modal.open)showModal(title,errorView(error.message,channel==='alipay'?'pay-alipay':'pay-wechat'));}
 finally{paymentCreating=false;}
}

function startPaymentPolling(order,key,owner,pollSeq,channel){
 let failures=0;
 const poll=async()=>{
  if(pollSeq!==paySeq||!modal.open||account?.id!==owner)return;
  payPollAbort=new AbortController();
  let delay=3000;
  try{
   const {order:latest}=await api('/pay/orders/'+encode(order.orderNo),{signal:payPollAbort.signal});
   if(pollSeq!==paySeq||!modal.open)return;
   failures=0;
   if(latest.status!=='pending'){
    pendingPaymentOrders.delete(key);
    if(channel==='alipay')showAlipayPayment(latest);else showPayment(latest,'');
    if(latest.status==='paid')data=await bootstrap();
    return;
   }
   const status=document.querySelector('#payment-status');if(status)status.textContent='';
  }catch(error){
   if(pollSeq!==paySeq||!modal.open)return;
   delay=Math.min(15000,3000*2**Math.min(++failures,3));
   const status=document.querySelector('#payment-status');
   if(status)status.textContent='订单状态暂时无法查询，正在重试，请勿重复支付。';
  }finally{
   payPollAbort=null;
   if(pollSeq===paySeq&&modal.open)payTimer=setTimeout(poll,delay);
  }
 };
 payTimer=setTimeout(poll,3000);
}

function showPayment(order,image){showModal('微信扫码支付',`<div class="payment-view"><p>${esc(order.courseTitle)}</p><p class="purchase-price">¥${Number(order.amountCents/100).toLocaleString('zh-CN',{maximumFractionDigits:2})}</p>${order.status==='paid'?'<p>支付成功，课程已加入学习中心。</p>':order.status==='closed'?'<p>订单已关闭，请重新发起支付。</p>':`<img src="${esc(image)}" alt="微信支付二维码" width="240" height="240"><p>请用微信“扫一扫”完成支付</p><p class="payment-order">订单号：${esc(order.orderNo)}</p>`}<p id="payment-status" role="status"></p></div>`,order.status==='paid'?btn('立即去查看','go:home','btn primary'):'');}

function showAlipayPayment(order,image){
 if(order.status==='pending'&&image){
  showModal('支付宝扫码支付',`<div class="payment-view"><p>${esc(order.courseTitle)}</p><p class="purchase-price">¥${Number(order.amountCents/100).toLocaleString('zh-CN',{maximumFractionDigits:2})}</p><img src="${esc(image)}" alt="支付宝支付二维码" width="240" height="240"><p>请用支付宝“扫一扫”完成支付</p><p class="payment-order">订单号：${esc(order.orderNo)}</p><p id="payment-status" role="status"></p></div>`);
  return;
 }
 showModal('支付宝扫码支付',`<div class="payment-view"><p>${esc(order.courseTitle)}</p><p class="purchase-price">¥${Number(order.amountCents/100).toLocaleString('zh-CN',{maximumFractionDigits:2})}</p>${order.status==='paid'?'<p>支付成功，课程已加入学习中心。</p>':order.status==='closed'?'<p>订单已关闭，请重新发起支付。</p>':'<p>正在确认支付状态…</p>'}<p id="payment-status" role="status"></p></div>`,order.status==='paid'?btn('立即去查看','go:home','btn primary'):'');
}

async function openAccount(){
 const snapshot=account;
 if(!snapshot)return;
 const levelLabel=profile=>{
  const level=profile.studentLevel;
  return Number.isSafeInteger(level?.level)&&level.level>=0&&typeof level.name==='string'&&level.name.trim()
   ?'Lv.'+level.level+' · '+level.name.trim():'暂未设置';
 };
 showModal('我的账号',`<p>账号：${esc(snapshot.username)}</p><p>学员等级：<span id="account-student-level" aria-live="polite">${esc(levelLabel(snapshot))}</span></p>${snapshot.expiresAt?'<p>有效期至 '+esc(new Date(snapshot.expiresAt).toLocaleDateString('zh-CN'))+'</p>':''}<p>版本 ${esc(appVersion||'—')}</p>`,btn('在线咨询','support','btn outline')+btn('退出登录','logout','btn primary'));
 const modalToken=paySeq;
 try{
  const {account:profile}=await api('/auth/me');
  if(account?.id!==snapshot.id||profile.id!==snapshot.id)return;
  account=profile;
  const label=modal.querySelector('#account-student-level');
  if(modal.open&&modalToken===paySeq&&label)label.textContent=levelLabel(profile);
 }catch{
  const label=modal.querySelector('#account-student-level');
  if(modal.open&&modalToken===paySeq&&label&&!snapshot.studentLevel)label.textContent='暂时无法查询';
 }
}
async function contact(){
 const seq=++searchSeq;showModal('在线咨询','<p>正在载入…</p>');const modalToken=paySeq;
 try{const {settings}=await api('/contact');if(!modal.open||seq!==searchSeq||modalToken!==paySeq)return;
 showModal('在线咨询',`<div class="consult-brand">${brand('consult-logo')}</div><figure class="consult-qr"><figcaption>扫码添加企业微信</figcaption>${picture(settings.qr1,'contact-qr','企业微信二维码')}</figure><dl class="consult-rows">${[['客服热线1',settings.hotline1],['客服热线2',settings.hotline2],['OK基地邮箱',settings.email],['企业微信',settings.wechatId]].map(([name,value])=>`<div><dt>${name}</dt><dd>${esc(value||'—')}</dd></div>`).join('')}</dl>`,btn('知道了','dismiss','btn primary'),'consult-modal');
 }catch(error){if(seq===searchSeq&&modal.open&&modalToken===paySeq)showModal('在线咨询',errorView(error.message,'support'));}
}
function openActivation(){showModal('激活课程','<label class="dialog-label" for="activation-code">课程激活码</label><input id="activation-code" autocomplete="off" maxlength="128" placeholder="请输入激活码"><p id="activation-status" role="status"></p>',btn('激活','activation-submit','btn primary'));document.querySelector('#activation-code').focus();}
async function activateCourse(){const field=document.querySelector('#activation-code'),status=document.querySelector('#activation-status'),button=modal.querySelector('[data-action="activation-submit"]');if(!field||button.disabled)return;const modalToken=paySeq,code=field.value.trim();if(!code){status.textContent='请输入激活码';return;}button.disabled=true;try{const result=await api('/activation-codes/redeem',{method:'POST',body:{code}});const resultData=await bootstrap();data=resultData;if(page==='home')render();if(modal.open&&modalToken===paySeq)showModal('激活课程',`<p>${esc(result.courseTitle)}${result.granted?'已激活，已加入我的课程。':'已授权，无需重复激活。'}</p>`);}catch(error){if(modal.open&&modalToken===paySeq&&document.querySelector('#activation-status')){status.textContent=error.message;button.disabled=false;}}}
function openHomeSearch(){modal.className='resource-search-modal';modal.innerHTML=`<h2>搜索我的课程与其他教程</h2>${searchInput('搜索课程或视频','home-query')}<div id="home-search-results"><p class="empty">输入关键词搜索当前账号的课程与视频</p></div><div>${btn('关闭','dismiss')}</div>`;modal.showModal();document.querySelector('#home-query').focus();}
function homeSearch(query){const term=query.trim().toLowerCase();return term?[...data.courses.map(c=>({...c,action:'owned',image:c.coverUrl})),...data.videos.map(v=>({...v,action:'standalone',image:v.coverUrl}))].filter(i=>i.title.toLowerCase().includes(term)).map(i=>`<button class="home-search-row" data-action="${i.action}:${esc(i.id)}">${picture(i.image)}<span>${esc(i.title)}</span></button>`).join('')||'<p class="empty">没有找到匹配的课程或视频</p>':'<p class="empty">输入关键词搜索当前账号的课程与视频</p>';}
function progressPayload(ended=false){if(!grant?.grantId||!currentLesson||currentVideo||!media||!Number.isFinite(media.duration)||media.duration<=0)return null;return {lessonId:currentLesson.id,playbackGrantId:grant.grantId,reportSequence:++progressSequence,positionSeconds:media.currentTime,durationSeconds:media.duration,completed:ended};}
async function reportProgress(ended=false){const epoch=playerEpoch,currentMedia=media,payload=progressPayload(ended);if(!payload)return;try{await api('/progress',{method:'POST',body:payload});}catch(error){if(page==='player'&&media===currentMedia&&epoch===playerEpoch){currentMedia.pause();document.querySelector('#player-status').textContent=error.message;}}}
async function stopPlayback(beacon=false){
 playerEpoch++;if(controls){controls.dispose();controls=null;}clearInterval(heartbeat);heartbeat=null;const previous=grant,lesson=currentLesson,video=currentVideo,payload=progressPayload(false);grant=null;
 if(media){if(document.pictureInPictureElement===media)try{await document.exitPictureInPicture();}catch{}media.pause();media.removeAttribute('src');media.load();media=null;}if(hls){hls.destroy();hls=null;}
 if(!previous?.grantId)return;
 const body={...(video?{videoId:video.id}:{lessonId:lesson?.id}),grantId:previous.grantId,...(payload?{finalProgress:payload}:{})};
 if(beacon){navigator.sendBeacon('/api/playback/release',new Blob([JSON.stringify(body)],{type:'application/json'}));return;}
 try{await api('/playback/release',{method:'POST',body,timeoutMs:2000});}catch{navigator.sendBeacon('/api/playback/release',new Blob([JSON.stringify(body)],{type:'application/json'}));}
}
async function openPlayer(item,video=false){
 const resumeKey='okplay:'+account.id+':'+(video?'video:':'lesson:')+item.id;let saved=0;try{saved=Number(localStorage.getItem(resumeKey))||0;}catch{}
 const resumeAt=(currentVideo?.id===item.id||currentLesson?.id===item.id)?(media?.currentTime||saved):saved;
 await stopPlayback();currentVideo=video?item:null;currentLesson=video?null:item;page='player';viewSeq++;notes=video?(item.description||'暂无视频简介'):'';playerError='';render();const epoch=playerEpoch;
 if(!video)api('/lessons/'+encode(item.id)+'/notes').then(result=>{if(epoch!==playerEpoch||page!=='player')return;notes=result.markdown;document.querySelector('.lesson-notes').innerHTML=window.renderNotes(notes||'暂无课堂笔记');}).catch(error=>{if(epoch===playerEpoch&&page==='player')document.querySelector('.lesson-notes').textContent=error.message;});
 let issued;
 try{issued=await api(`/${video?'videos':'lessons'}/${encode(item.id)}/playback`,{method:'POST'});if(epoch!==playerEpoch||page!=='player'){if(issued.grantId)api('/playback/release',{method:'POST',body:{[video?'videoId':'lessonId']:item.id,grantId:issued.grantId}}).catch(()=>{});return;}
  const url=new URL(issued.url);if(url.protocol!=='https:'||url.username||url.password)throw Error('服务返回的播放地址不安全');if(issued.drmAuthToken)url.searchParams.set('DrmAuthToken',issued.drmAuthToken);
  grant=issued;let HlsLibrary=null;const isHls=/\.m3u8(?:$|\?)/i.test(url.href);if(isHls){HlsLibrary=await window.okplayFeatures.load('hls');if(epoch!==playerEpoch||page!=='player')return;}progressSequence=0;media=document.querySelector('#video');media.playbackRate=rate;media.muted=muted;
  const status=document.querySelector('#player-status');status.textContent='';
  const currentMedia=media;let mediaFailed=false;
  const failMedia=message=>{if(epoch!==playerEpoch||mediaFailed)return;mediaFailed=true;clearTimeout(heartbeat);const failed=grant;grant=null;hls?.stopLoad();currentMedia.pause();status.innerHTML=esc(message)+' '+btn('重新申请播放','retry-player','btn outline');if(failed?.grantId)void api('/playback/release',{method:'POST',body:{[video?'videoId':'lessonId']:item.id,grantId:failed.grantId},timeoutMs:2000}).catch(()=>{});};
  controls=window.attachPlayerControls(currentMedia,{onRate:value=>{rate=value;},onMute:value=>{muted=value;},onQuality:value=>{if(hls)hls.currentLevel=value;}});
  let lastSave=0;currentMedia.addEventListener('timeupdate',()=>{if(epoch!==playerEpoch||Date.now()-lastSave<1500||!Number.isFinite(currentMedia.duration)||currentMedia.currentTime<=0)return;lastSave=Date.now();try{localStorage.setItem(resumeKey,String(currentMedia.currentTime));}catch{}});
  currentMedia.addEventListener('ended',()=>{try{localStorage.removeItem(resumeKey);}catch{}});
  currentMedia.addEventListener('loadedmetadata',()=>{if(epoch===playerEpoch&&resumeAt>0&&Number.isFinite(currentMedia.duration))currentMedia.currentTime=resumeAt<currentMedia.duration-1?resumeAt:0;},{once:true});
  currentMedia.addEventListener('pause',()=>{if(epoch===playerEpoch)void reportProgress();});
  currentMedia.addEventListener('ended',()=>{if(epoch===playerEpoch)void reportProgress(true);});
  currentMedia.addEventListener('error',()=>failMedia('视频加载失败，请重试或检查网络'));
  if(isHls&&HlsLibrary?.isSupported()){
   hls=new HlsLibrary({enableWorker:true});hls.loadSource(url.href);hls.attachMedia(currentMedia);hls.on(HlsLibrary.Events.MANIFEST_PARSED,()=>{if(epoch===playerEpoch)controls?.qualities(hls.levels);});hls.on(HlsLibrary.Events.ERROR,(_event,event)=>{if(event.fatal)failMedia('视频加载失败，播放授权可能已过期。');});
  }else currentMedia.src=url.href;
  currentMedia.play().catch(()=>{if(epoch===playerEpoch&&!mediaFailed)status.textContent='点击播放器播放按钮开始学习';});
  const tick=async()=>{if(epoch!==playerEpoch||!grant)return;try{if(Date.parse(issued.expiresAt)<=Date.now()+60000){await openPlayer(item,video);return;}if(video){const result=await api(`/videos/${encode(item.id)}/heartbeat`,{method:'POST',body:{grantId:issued.grantId}});if(result.renew&&epoch===playerEpoch){await openPlayer(item,true);return;}}else await reportProgress();}catch(error){if(epoch===playerEpoch){currentMedia.pause();status.textContent=error.message;}}finally{if(epoch===playerEpoch&&grant)heartbeat=setTimeout(tick,30000);}};heartbeat=setTimeout(tick,30000);
 }catch(error){if(epoch!==playerEpoch||page!=='player')return;const failed=grant||issued;grant=null;if(failed?.grantId)void api('/playback/release',{method:'POST',body:{[video?'videoId':'lessonId']:item.id,grantId:failed.grantId},timeoutMs:2000}).catch(()=>{});playerError=error.message;document.querySelector('#player-status').innerHTML=esc(error.message)+' '+btn('重试','retry-player','btn outline');}
}
addEventListener('pagehide',()=>{void stopPlayback(true);});
async function boot(){page='loading';render();try{const result=await api('/auth/me');account=result.account;await navigate('home');}catch(error){page='login';render();if(error.status!==401)loginError(error.message);}}
addEventListener('resize',()=>{resize();if(kinds[page]&&groups.length&&resourceLimit!==(innerWidth<800?9:18)){resourcePage=0;void loadResourceItems();}});
document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement){if(event.target.dataset.fallbackSrc&&!event.target.dataset.fullsizeRetried){event.target.dataset.fullsizeRetried='true';event.target.removeAttribute('srcset');event.target.src=event.target.dataset.fallbackSrc;return;}if(event.target.hasAttribute('data-brand')&&!event.target.dataset.fallback){event.target.dataset.fallback='true';event.target.src='assets/ok-logo.webp';return;}const placeholder=document.createElement('span');placeholder.className='image-placeholder '+event.target.className;placeholder.textContent='▷';event.target.replaceWith(placeholder);}},true);
document.addEventListener('change',event=>{if(event.target.matches('#login [name=remember]')&&!event.target.checked){remembered='';try{localStorage.removeItem('production-account');}catch{}}});
document.addEventListener('submit',event=>{if(event.target.id==='login'){event.preventDefault();void startLogin(event.target);}});
document.addEventListener('input',event=>{
 if(event.target.id==='home-query')document.querySelector('#home-search-results').innerHTML=homeSearch(event.target.value);
 if(event.target.id==='catalog-query'){catalogQuery=event.target.value;document.querySelector('#results').innerHTML=catalogCards();}
 if(event.target.id==='resource-query'){clearTimeout(searchTimer);searchSeq++;const value=event.target.value;searchTimer=setTimeout(()=>{void searchResources(value);},250);}
 if(event.target.id==='captcha-code'&&captcha?.kind==='text'&&event.target.value.trim().length===Number(captcha.length))void submitLogin(event.target.value.trim());
});
modal.addEventListener('close',()=>{stopPaymentPolling();paySeq++;});
modal.addEventListener('cancel',event=>{if(authSubmitting){event.preventDefault();return;}searchSeq++;if(captcha)closeCaptcha();});
document.addEventListener('click',event=>{
 const b=event.target.closest('button');if(!b)return;if(b.dataset.window){window.desktop.windowAction(b.dataset.window);return;}if(!b.dataset.action)return;event.preventDefault();
 const [action,param]=b.dataset.action.split(':');
 const task=async()=>{
 if(action==='go'){modal.close();await navigate(param);}
 else if(action==='refresh-home')await navigate('home');
 else if(action==='home-search')openHomeSearch();
 else if(action==='activate')openActivation();
 else if(action==='activation-submit')await activateCourse();
 else if(action==='owned'){modal.close();await openCourse(param);}
 else if(action==='notes-download')openCourseNotes();
 else if(action==='notes-open'){const url=safeUrl(String(course?.notesDownloadUrl||'').trim().split(/\s+/)[0]);if(!url||!await window.desktop.openExternal(url))document.querySelector('#notes-download-error').textContent='无法打开此地址，请手动选中复制。';}
 else if(action==='lesson'){const item=allLessons().find(l=>l.id===param)||allLessons()[0];if(item)await openPlayer(item);}
 else if(action==='next-lesson'){const list=allLessons(),index=list.findIndex(l=>l.id===currentLesson?.id);if(list[index+1])await openPlayer(list[index+1]);}
 else if(action==='standalone'){modal.close();const item=data.videos.find(v=>v.id===param);if(item)await openPlayer(item,true);}
 else if(action==='retry-player')await openPlayer(currentVideo||currentLesson,!!currentVideo);
 else if(action==='resource-primary'){primary=Number(param);secondary=resourcePage=0;await loadResourceItems();}
 else if(action==='resource-secondary'){secondary=Number(param);resourcePage=0;await loadResourceItems();}
 else if(action==='resource-next'||action==='resource-prev'){resourcePage+=action==='resource-next'?1:-1;await loadResourceItems();}
 else if(action==='resource-search')openResourceSearch();
 else if(action==='resource')await openResource(param);
 else if(action==='search-retry')await searchResources(document.querySelector('#resource-query').value);
 else if(action==='retry'){if(groups.length)await loadResourceItems();else await navigate(page);}
 else if(action==='catalog-group')document.querySelector('#catalog-section-'+Number(param))?.scrollIntoView({behavior:'smooth',block:'start'});

 else if(action==='pay-wechat')await startPayment('wechat');else if(action==='pay-alipay')await startPayment('alipay');
 else if(action==='buy')buyCourse(param);
 else if(action==='external'){if(!externalUrl||!await window.desktop.openExternal(externalUrl)){const error=modal.querySelector('.external-error');if(error)error.textContent='无法打开此地址，请手动选中复制。';else showModal('无法打开链接','<p>仅支持安全的 HTTPS 外部链接</p>');}}
 else if(action==='account')void openAccount();
 else if(action==='logout'){await stopPlayback();try{await api('/auth/logout',{method:'POST'});resetSession();}catch(error){showModal('退出失败',errorView(error.message,'logout'));}}
 else if(action==='support')await contact();
 else if(action==='legal')await window.desktop.openExternal(param==='icp'?'https://beian.miit.gov.cn/':'https://beian.mps.gov.cn/');
 else if(action==='dismiss'){if(authSubmitting)return;searchSeq++;clearTimeout(searchTimer);if(captcha)closeCaptcha();else modal.close();}
 };
 task().catch(error=>{if(page==='login')loginError(error.message);else showModal('操作失败',`<p>${esc(error.message)}</p>`);});
});
stage.insertAdjacentHTML('beforebegin',`<header class="titlebar"><div class="title-brand">${brand('brand')}<span class="win-title">OKPlay - OK基地</span></div><div class="nav-arrows"><button class="nav-arrow" data-nav="back" aria-label="后退" title="后退">←</button><button class="nav-arrow" data-nav="forward" aria-label="前进" title="前进">→</button><button class="nav-refresh" data-nav="refresh" aria-label="刷新" title="刷新">刷新</button></div><div class="window-actions">${['min','max','close'].map((id,i)=>`<button data-window="${id}" aria-label="${['最小化','最大化或还原','关闭'][i]}"><i class="${id}"></i></button>${id==='min'?'<button type="button" class="window-update" hidden>更新</button>':''}`).join('')}</div></header>`);
const updateButton=document.querySelector('.window-update');
window.desktop.checkUpdate().then(version=>{
 if(!version)return;
 updateButton.title='下载新版 '+version;
 updateButton.hidden=false;
}).catch(()=>{});
window.desktop.onUpdateProgress(percent=>{
 if(updateButton.disabled)updateButton.textContent=percent===100?'下载完成':'下载 '+percent+'%';
});
updateButton.addEventListener('click',async()=>{
 updateButton.disabled=true;
 updateButton.textContent='下载中…';
 let downloaded=false;
 try{
  downloaded=await window.desktop.downloadUpdate()==='ready';
  if(downloaded){
   updateButton.textContent='安装中…';
   stopPaymentPolling();
   await stopPlayback();
   if(await window.desktop.installUpdate())return;
  }
 }catch{}
 updateButton.textContent='更新';
 updateButton.disabled=false;
 const message=downloaded?'无法启动安装程序，请稍后重试。':'更新包下载或校验失败，请稍后重试。';
 showModal('更新','<p>'+message+'</p>');
});
document.addEventListener('click',event=>{const b=event.target.closest('[data-nav]');if(!b||b.disabled)return;event.preventDefault();if(b.dataset.nav==='refresh'){void refreshView();return;}void goHistory(b.dataset.nav==='back'?-1:1);});
addEventListener('keydown',event=>{const editing=event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable]');if((event.altKey&&!event.ctrlKey&&!event.metaKey)&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){event.preventDefault();void goHistory(event.key==='ArrowLeft'?-1:1);return;}if(!editing&&!modal.open&&event.key==='Backspace'){event.preventDefault();void goHistory(-1);}});
window.desktop?.onNavigate?.(direction=>void goHistory(direction==='back'?-1:1));
let preparingClose=false;
window.desktop.onPrepareClose(async()=>{if(preparingClose)return;preparingClose=true;stopPaymentPolling();try{await stopPlayback();}finally{window.desktop.closeReady();}});
addEventListener('visibilitychange',()=>{for(const video of [pageBackdrop.querySelector('video'),document.querySelector('.login-background')])if(video){if(document.hidden)video.pause();else if(video.isConnected)video.play().catch(()=>{});}});
void (window.desktop?.version?.()||Promise.resolve('')).then(v=>{appVersion=v||'';}).catch(()=>{});
addEventListener('resize',()=>{requestAnimationFrame(()=>{fitAccountLabel();if(kinds[page])void fitResourceToScreen();});});
void boot();
})();

