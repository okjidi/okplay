module.exports=async function(win,page,fixture){
 const fs=require('node:fs/promises'),path=require('node:path');
 fixture.state.referenceRoot=path.join(__dirname,'..','design','全面检查-20261125','reference-app');
 const out=path.join(__dirname,'..','design','全面检查-20261125','旧版');await fs.mkdir(out,{recursive:true});win.setSize(1400,820);
 const run=code=>win.webContents.executeJavaScript(code,true);
 const wait=async code=>{for(let i=0;i<200;i++){if(await run(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('旧版截图等待超时：'+code);};
 const shot=async name=>{await run("Promise.all([document.fonts.ready,...[...document.images].map(i=>i.decode().catch(()=>{}))])");await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');await fs.writeFile(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 const clickText=async text=>{await run(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('未找到按钮');b.click()})()`);};
 await win.loadURL('https://learn.okyolo.com/__reference__/');await wait("!!document.querySelector('#username')");await wait("document.querySelector('.login-visual video').readyState>=2");await shot('01-登录');await fs.writeFile(path.join(out,'尺寸.json'),JSON.stringify(await run("(()=>{const r=document.querySelector('.login-card').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,inputHeight:document.querySelector('#password').getBoundingClientRect().height,buttonHeight:document.querySelector('[type=submit]').getBoundingClientRect().height,titleSize:getComputedStyle(document.querySelector('.login-card h1')).fontSize};})()"),null,2));
 await run("(()=>{const set=(id,value)=>{const e=document.querySelector(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));};set('#username','test-student');set('#password','synthetic-password');})()");
 await clickText('登录');await wait("!![...document.querySelectorAll('h2')].find(h=>h.textContent==='我的课程')");await shot('02-学习中心');
 for(const [i,title] of ['软件/工具','源码/模版','UI/特效/素材','Ai 平台','大模型/Git平台'].entries()){
  await clickText(title);await wait("!!document.querySelector('.res-cat-row--sub')&&document.querySelectorAll('.course-grid--compact .course-card').length>0");await shot(String(i+4).padStart(2,'0')+'-'+title.replaceAll('/','-'));
 }
 await clickText('学习中心');await wait("!!document.querySelector('.course-grid--cols6')");await run("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('接口课程甲')).click()");await wait("!!document.querySelector('.course-hero')");await shot('09-课程详情');
 await run("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('课程笔记下载')).click()");await wait("!!document.querySelector('.modal')");await shot('10-笔记下载');await run("[...document.querySelectorAll('.modal button')].find(b=>b.textContent==='关闭').click()");
 await run("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('接口课时一')).click()");await wait("!!document.querySelector('.video-shell video')");await wait("document.querySelector('.video-shell video').readyState>=1");await new Promise(r=>setTimeout(r,300));await shot('11-课程播放');
 await clickText('学习中心');await wait("!!document.querySelector('.course-grid--cols6')");await clickText('🏠全部课程');await wait("document.body.textContent.includes('接口可购课程')");await shot('03-全部课程');
 await fs.writeFile(path.join(out,'capture.json'),JSON.stringify({viewport:[1400,820],source:'旧项目 web/dist 只读副本',data:'隔离合成数据',productionWrites:false},null,2));
};
