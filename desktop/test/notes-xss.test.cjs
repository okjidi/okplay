const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');

function renderer(){
  const window={};
  vm.runInNewContext(fs.readFileSync('app/notes.js','utf8'),{window});
  return window.renderNotes;
}

test('课堂笔记先转义再格式化，脚本/属性注入都变成文本',()=>{
  const render=renderer();
  const html=render('<img src=x onerror="alert(1)">\n\n<script>alert(2)</script>\n\n**粗体** `code`');
  assert.doesNotMatch(html,/<img/i);
  assert.doesNotMatch(html,/<script/i);
  assert.match(html,/onerror=&quot;/); // 属性已转义成文本，不是可执行属性
  assert.match(html,/<strong>粗体<\/strong>/);
  assert.match(html,/<code>code<\/code>/);
});

test('笔记里的 HTML 实体与引号保持转义，不产生可执行链接',()=>{
  const render=renderer();
  const html=render('[x](javascript:alert(1)) "quoted" & <b>');
  assert.doesNotMatch(html,/href=/i);
  assert.doesNotMatch(html,/<b>/i);
  assert.match(html,/&quot;quoted&quot;/);
  assert.match(html,/&amp;/);
});
