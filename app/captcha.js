(function(){
// 指针位置按显示宽度换算比例，兼容桌面缩放和触摸输入。
window.bindPuzzleCaptcha=function(box,{pieceSize,isDisabled,onDrop}){
 const piece=box.querySelector('#captcha-piece');
 let ratio=0,pointer=null;
 const clamp=value=>Math.max(0,Math.min(1-pieceSize,value));
 const set=value=>{ratio=clamp(value);piece.style.left=ratio*100+'%';box.setAttribute('aria-valuenow',String(Math.round(ratio*100)));};
 const at=event=>{const rect=box.getBoundingClientRect();return rect.width?(event.clientX-rect.left)/rect.width:ratio;};
 box.addEventListener('pointerdown',event=>{
  if(isDisabled()||event.button!==0||pointer!==null)return;
  event.preventDefault();pointer=event.pointerId;box.setPointerCapture(pointer);box.dataset.dragging='true';set(at(event));
 });
 box.addEventListener('pointermove',event=>{if(pointer===event.pointerId&&!isDisabled())set(at(event));});
 box.addEventListener('pointerup',event=>{
  if(pointer!==event.pointerId)return;
  pointer=null;box.dataset.dragging='false';if(box.hasPointerCapture(event.pointerId))box.releasePointerCapture(event.pointerId);
  if(isDisabled())return;set(at(event));box.setAttribute('aria-disabled','true');onDrop(ratio);
 });
 const cancel=()=>{pointer=null;box.dataset.dragging='false';};
 box.addEventListener('pointercancel',cancel);box.addEventListener('lostpointercapture',cancel);
 box.addEventListener('keydown',event=>{
  if(isDisabled())return;
  if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();set(ratio+(event.key==='ArrowRight'?1:-1)*(event.shiftKey ? .05 : .01));}
  else if(event.key==='Enter'||event.key===' '){event.preventDefault();box.setAttribute('aria-disabled','true');onDrop(ratio);}
 });
};
})();
