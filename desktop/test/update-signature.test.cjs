const assert=require('node:assert/strict'),test=require('node:test');
const crypto=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {checkForUpdate,downloadUpdate,launchInstaller,updatePolicy}=require('../update-check.cjs');
const pair=crypto.generateKeyPairSync('ed25519');
const publicKey=pair.publicKey.export({type:'spki',format:'pem'}).toString();
const payload=fields=>Buffer.from(JSON.stringify({schema:1,version:fields.version,url:fields.url,sha256:fields.sha256}));
const signed=fields=>({...fields,schema:1,signature:crypto.sign(null,payload(fields),pair.privateKey).toString('base64')});
const fields={version:'99.0.0',url:'https://example.test/OKPlay.exe',sha256:'a'.repeat(64)};
test('missing pinned key disables update lookup before any network request',async()=>{
 let calls=0;
 assert.equal(await checkForUpdate({feedUrl:'https://example.test/update.json',currentVersion:'0.4.6',fetchImpl:async()=>{calls++;return new Response(JSON.stringify(fields));}}),null);
 assert.equal(calls,0);
});
test('only the pinned release key can authorize schema, version, URL and hash',async()=>{
 const options={feedUrl:'https://example.test/update.json',currentVersion:'0.4.6',publicKey};
 const lookup=data=>checkForUpdate({...options,fetchImpl:async()=>new Response(JSON.stringify(data))});
 assert.equal((await lookup(signed(fields)))?.version,'99.0.0');
 for(const data of [fields,{...signed(fields),schema:2},{...signed(fields),version:'99.1.0'},
  {...signed(fields),url:'https://another.test/OKPlay.exe'},{...signed(fields),sha256:'b'.repeat(64)},
  {...signed(fields),signature:crypto.sign(null,payload(fields),crypto.generateKeyPairSync('ed25519').privateKey).toString('base64')}]){
  assert.equal(await lookup(data),null);
 }
});
test('unsigned downloads are rejected without fetching or creating an installer',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'okplay-signature-test-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 let calls=0;
 await assert.rejects(downloadUpdate(fields,{directory,publicKey,fetchImpl:async()=>{calls++;return new Response('fake');}}),/签名|发布/);
 assert.equal(calls,0);assert.deepEqual(await fs.readdir(directory),[]);
});
test('installer execution rechecks signed hash and refuses a file replaced after download',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'okplay-install-verify-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const file=path.join(directory,'synthetic.exe');await fs.writeFile(file,'original synthetic installer');
 const update=signed({...fields,sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')});
 await fs.writeFile(file,'changed after download');let spawned=0;
 await assert.rejects(launchInstaller(file,{update,publicKey,spawnImpl:()=>{spawned++;throw Error('must not execute');}}),/校验|签名/);
 assert.equal(spawned,0);
});
test('packaged update policy ignores environment feed replacement and fails closed without a pinned key',()=>{
 const config={updateFeed:'https://example.test/official.json',updatePublicKey:publicKey};
 assert.equal(updatePolicy({packaged:true,configuration:config,environment:{OKPLAY_UPDATE_URL:'https://another.test/feed.json'}}).feedUrl,config.updateFeed);
 assert.equal(updatePolicy({packaged:true,configuration:{updateFeed:config.updateFeed},environment:{}}).feedUrl,null);
});

test('release tooling defaults to a disabled feed and only signs using an explicit matching offline key',async t=>{
 const {makeUpdateFeed}=require('../tools/make-update-feed.cjs');
 const pkg=require('../package.json');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'okplay-signing-tool-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const artifacts=path.join(directory,'artifacts');await fs.mkdir(artifacts);
 await fs.writeFile(path.join(artifacts,`OKPlay-${pkg.version}-x64.exe`),'synthetic release file');
 const disabled=await makeUpdateFeed(artifacts,{publicKey:''});
 assert.equal(disabled.enabled,false);assert.equal(disabled.url,undefined);
 await assert.rejects(makeUpdateFeed(artifacts,{publicKey}),/签名.*密钥|私钥/);
 const keyFile=path.join(directory,'synthetic-offline-key.pem');
 await fs.writeFile(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 const signedFeed=await makeUpdateFeed(artifacts,{publicKey,privateKeyPath:keyFile});
 const checked=await checkForUpdate({feedUrl:pkg.okplay.updateFeed,currentVersion:'0.0.0',publicKey,fetchImpl:async()=>new Response(JSON.stringify(signedFeed))});
 assert.equal(checked?.version,pkg.version);
 const wrongKey=crypto.generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString();
 await assert.rejects(makeUpdateFeed(artifacts,{publicKey:wrongKey,privateKeyPath:keyFile}),/匹配|签名/);
 assert.equal((await fs.readdir(artifacts)).some(file=>file.endsWith('.pem')),false);
});
