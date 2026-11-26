const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{createReadStream}=require('node:fs');
const pkg=require('../package.json');

async function hash(file){const sum=crypto.createHash('sha256');for await(const chunk of createReadStream(file))sum.update(chunk);return sum.digest('hex');}

async function makeUpdateFeed(directory){
  const feed=pkg.okplay?.updateFeed;
  if(!feed)throw Error('package.json 缺少 okplay.updateFeed 更新地址');
  const names=await fs.readdir(directory);
  const manifestName=names.includes('release-manifest.json')?'release-manifest.json':null;
  let version=pkg.version;
  if(manifestName){
    const manifest=JSON.parse(await fs.readFile(path.join(directory,manifestName),'utf8'));
    if(typeof manifest.version==='string'&&manifest.version.trim())version=manifest.version.trim();
  }
  const installers=names.filter(name=>/^(?!.*__uninstaller).*\.exe$/i.test(name));
  const installer=installers.find(name=>name.includes(`-${version}-`)||name.includes(`-${version}.`))
    ||(await Promise.all(installers.map(async name=>({name,time:(await fs.stat(path.join(directory,name))).mtimeMs})))).sort((a,b)=>b.time-a.time)[0]?.name;
  if(!installer)throw Error('目录中没有与版本 '+version+' 匹配的 .exe 安装包：'+directory);
  const base=feed.replace(/[^/]*$/,'');
  const out={version,url:base+installer,sha256:await hash(path.join(directory,installer))};
  const file=path.join(directory,'update.json');
  await fs.writeFile(file,JSON.stringify(out,null,2)+'\n');
  console.log('已生成 '+file);
  console.log(JSON.stringify(out,null,2));
  return out;
}

if(require.main===module)makeUpdateFeed(path.resolve(process.argv[2]||'release')).catch(error=>{console.error('生成更新源失败：'+error.message);process.exitCode=1;});
module.exports={makeUpdateFeed};
