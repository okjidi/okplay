const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{createReadStream}=require('node:fs');
async function hash(file){const sum=crypto.createHash('sha256');for await(const chunk of createReadStream(file))sum.update(chunk);return sum.digest('hex');}
async function verify(directory){
 const asar=await import('@electron/asar'),archive=path.join(directory,'win-unpacked','resources','app.asar'),entries=asar.listPackage(archive).map(p=>p.replaceAll('\\','/').replace(/^\//,''));
 for(const name of ['main.cjs','preload.cjs','desktop-service.cjs','lifecycle.cjs','identity.cjs','update-check.cjs','app/index.html','app/features.js','app/recovery.html','app/recovery.js','app/assets/icon.ico'])if(!entries.includes(name))throw Error('发行包缺少文件：'+name);
 if(entries.some(name=>/^(test|design|tools|\.cache|\.learnings|node_modules)\//.test(name)||/(^|\/)(qa\.cjs|production-check\.cjs|demo\.mp4|cover\d\.png|\.env)$/.test(name)))throw Error('发行包混入测试或开发数据');
 const read=name=>asar.extractFile(archive,path.normalize(name));
 const pkg=JSON.parse(read('package.json').toString()),html=read('app/index.html').toString();
 for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){const resource='app/'+match[1];if(!entries.includes(resource))throw Error('页面引用缺失：'+resource);}
 for(const name of entries.filter(name=>name.endsWith('.js')||name.endsWith('.cjs'))){const archived=read(name);const local=await fs.readFile(path.join(__dirname,'..',name));if(!archived.equals(local))throw Error('发行代码与当前源码不同：'+name);const source=read(name).toString();if(source.includes('synthetic-password'))throw Error('发行代码包含隔离凭据');new (require('node:vm').Script)(name.endsWith('.cjs')?require('node:module').wrap(source):source,{filename:name});}
 const artifacts=(await fs.readdir(directory)).filter(name=>name.endsWith('.exe')||name.endsWith('.zip'));
 if(!artifacts.some(name=>name.endsWith('.exe'))||!artifacts.some(name=>name.endsWith('.zip')))throw Error('安装包或便携包缺失');
 const checksums=[];for(const name of artifacts)checksums.push({file:name,bytes:(await fs.stat(path.join(directory,name))).size,sha256:await hash(path.join(directory,name))});
 if(pkg.okplay?.updateFeed){
  const feed=JSON.parse(await fs.readFile(path.join(directory,'update.json'),'utf8'));
  const installer=checksums.find(item=>item.file==='OKPlay-'+pkg.version+'-x64.exe');
  const expectedUrl=new URL(installer?.file??'',pkg.okplay.updateFeed).href;
  if(!installer||feed.version!==pkg.version||feed.url!==expectedUrl||feed.sha256!==installer.sha256)throw Error('update.json 与当前版本安装包不匹配');
 }
 const report={version:pkg.version,platform:'win32-x64',archiveEntries:entries.length,archiveBytes:(await fs.stat(archive)).size,archiveSha256:await hash(archive),excluded:['test','design','tools','node_modules','demo.mp4'],artifacts:checksums};
 await fs.writeFile(path.join(directory,'release-manifest.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(directory,'SHA256SUMS.txt'),checksums.map(i=>i.sha256+' *'+i.file).join('\n')+'\n');console.log(JSON.stringify(report,null,2));return report;
}
if(require.main===module)verify(path.resolve(process.argv[2]||'release-candidate')).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={verify};
