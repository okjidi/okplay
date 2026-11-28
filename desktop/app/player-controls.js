(function(){
const icon=name=>window.playerIcons?.[name]||'';
const stamp=value=>{value=Math.max(0,Math.floor(value||0));return Math.floor(value/60).toString().padStart(2,'0')+':'+(value%60).toString().padStart(2,'0');};
window.playerControlsMarkup=()=>`<div class="video-controls"><input class="media-seek" type="range" min="0" max="100" step=".01" value="0" aria-label="播放进度"><div class="media-control-row"><button class="media-button media-toggle" aria-label="播放">${icon('play')}</button><span class="media-time">00:00 / 00:00</span><span class="media-spacer"></span><button class="media-button media-pip" aria-label="画中画">${icon('pip')}</button><select class="media-quality" aria-label="清晰度"><option value="-1">原画</option></select><button class="media-button media-mute" aria-label="静音">${icon('volume')}</button><input class="media-volume" type="range" min="0" max="1" step=".05" value="1" aria-label="音量"><select class="media-rate" aria-label="播放倍速">${[.75,1,1.25,1.5,2,3,4].map(n=>`<option value="${n}" ${n===1?'selected':''}>${n}×</option>`).join('')}</select><button class="media-button media-fullscreen" aria-label="全屏">${icon('fullscreen')}</button></div><p class="media-control-error" role="status"></p></div>`;
window.attachPlayerControls=function(video,{onRate,onMute,onQuality}){
 const pane=video.closest('.video-pane'),q=s=>pane.querySelector(s),seek=q('.media-seek'),toggle=q('.media-toggle'),mute=q('.media-mute'),rate=q('.media-rate'),volume=q('.media-volume');
 let hover=false;
 const update=()=>{const duration=Number.isFinite(video.duration)?video.duration:0;seek.value=duration?video.currentTime/duration*100:0;q('.media-time').textContent=stamp(video.currentTime)+' / '+stamp(duration);toggle.dataset.state=video.paused?'paused':'playing';toggle.setAttribute('aria-label',video.paused?'播放':'暂停');mute.dataset.level=video.muted||video.volume===0?'muted':video.volume<.5?'low':'high';mute.setAttribute('aria-label',video.muted?'取消静音':'静音');volume.value=video.muted?0:video.volume;rate.value=video.playbackRate;};
 const play=()=>video.paused?video.play().catch(()=>{q('.media-control-error').textContent='请点击播放按钮开始播放';}):video.pause();
 const full=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await pane.requestFullscreen();}catch{q('.media-control-error').textContent='无法进入全屏，请使用窗口最大化';}};
 toggle.addEventListener('click',play);video.addEventListener('click',play);
 seek.addEventListener('input',()=>{if(Number.isFinite(video.duration))video.currentTime=Number(seek.value)/100*video.duration;});
 rate.addEventListener('change',()=>{video.playbackRate=Number(rate.value);onRate(video.playbackRate);});
 volume.addEventListener('input',()=>{video.volume=Number(volume.value);video.muted=video.volume===0;onMute(video.muted);});
 mute.addEventListener('click',()=>{video.muted=!video.muted;if(!video.muted&&!video.volume)video.volume=.5;onMute(video.muted);});
 q('.media-fullscreen').addEventListener('click',full);
 q('.media-quality').addEventListener('change',event=>onQuality(Number(event.target.value)));
 if(!document.pictureInPictureEnabled||!video.requestPictureInPicture)q('.media-pip').hidden=true;
 q('.media-pip').addEventListener('click',async()=>{try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else await video.requestPictureInPicture();}catch{q('.media-control-error').textContent='当前视频无法开启画中画';}});
 pane.addEventListener('pointerenter',()=>{hover=true;});pane.addEventListener('pointerleave',()=>{hover=false;});
 const key=event=>{if(!(hover||pane.contains(document.activeElement))||/INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName))return;if([' ','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','m','M','f','F'].includes(event.key))event.preventDefault();if(event.key===' ')play();else if(event.key==='ArrowLeft')video.currentTime=Math.max(0,video.currentTime-5);else if(event.key==='ArrowRight')video.currentTime=Math.min(video.duration||0,video.currentTime+5);else if(event.key==='ArrowUp')video.volume=Math.min(1,video.volume+.05);else if(event.key==='ArrowDown')video.volume=Math.max(0,video.volume-.05);else if(event.key.toLowerCase()==='m'){video.muted=!video.muted;onMute(video.muted);}else if(event.key.toLowerCase()==='f')void full();};
 document.addEventListener('keydown',key);for(const name of ['timeupdate','durationchange','play','pause','volumechange','ratechange'])video.addEventListener(name,update);video.controls=false;pane.tabIndex=0;update();
 return {dispose:()=>{document.removeEventListener('keydown',key);},qualities:levels=>{const select=q('.media-quality');select.replaceChildren();const auto=document.createElement('option');auto.value='-1';auto.textContent=levels.length>1?'自动':'原画';select.append(auto);if(levels.length>1)levels.forEach((level,i)=>{const opt=document.createElement('option');opt.value=i;opt.textContent=level.height?level.height+'P':'清晰度 '+(i+1);select.append(opt);});}};
};
})();
