const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{createReadStream}=require('node:fs');
const pkg=require('../package.json');
const {manifestPayload,verifyUpdateManifest,safeHttps}=require('../update-check.cjs');

async function hash(file){const sum=crypto.createHash('sha256');for await(const chunk of createReadStream(file))sum.update(chunk);return sum.digest('hex');}

async function makeUpdateFeed(directory,{publicKey=pkg.okplay?.updatePublicKey,privateKeyPath}={}){
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
  const installer='OKPlay-'+version+'-x64.exe';
  if(!installers.includes(installer))throw Error('目录中缺少 '+installer+'：'+directory);
  const base=feed.replace(/[^/]*$/,'');
  let out;
  if(!publicKey&&!privateKeyPath){
    // 无固定公钥的构建不得产生可自动执行的未签名清单。
    out={schema:1,enabled:false,version};
  }else{
    if(!publicKey)throw Error('请先在构建配置固定更新发布公钥');
    if(!privateKeyPath)throw Error('缺少离线更新签名私钥文件，请显式传入 --key-file');
    if(!safeHttps(feed))throw Error('更新源必须使用HTTPS');
    const payload={schema:1,version,url:base+installer,sha256:await hash(path.join(directory,installer))};
    const bytes=manifestPayload(payload);if(!bytes)throw Error('更新发布清单格式无效');
    let key;
    try{key=crypto.createPrivateKey(await fs.readFile(privateKeyPath));}catch{throw Error('更新签名密钥不可用');}
    if(key.asymmetricKeyType!=='ed25519')throw Error('更新签名私钥必须为Ed25519');
    out={...payload,signature:crypto.sign(null,bytes,key).toString('base64')};
    if(!verifyUpdateManifest(out,publicKey))throw Error('签名私钥与构建中固定的更新公钥不匹配');
  }
  const file=path.join(directory,'update.json');
  await fs.writeFile(file,JSON.stringify(out,null,2)+'\n');
  console.log('已生成 '+file);
  console.log(JSON.stringify(out,null,2));
  return out;
}

if(require.main===module){
  const args=process.argv.slice(2),directory=path.resolve(args[0]||'release');
  const valid=args.length<=1||(args.length===3&&args[1]==='--key-file'&&args[2]);
  if(!valid){console.error('用法：node tools/make-update-feed.cjs <发布目录> [--key-file <离线私钥路径>]');process.exitCode=1;}
  else makeUpdateFeed(directory,{privateKeyPath:args[2]?path.resolve(args[2]):undefined}).catch(error=>{console.error('生成更新源失败：'+error.message);process.exitCode=1;});
}
module.exports={makeUpdateFeed};
