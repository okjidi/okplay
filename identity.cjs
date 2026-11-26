const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function deviceIdentity(userData,safeStorage){
 const file=path.join(userData,'production-device.bin');
 const asynchronous=typeof safeStorage.isAsyncEncryptionAvailable==='function';
 const available=asynchronous?await safeStorage.isAsyncEncryptionAvailable():safeStorage.isEncryptionAvailable();
 if(!available){const error=Error('系统安全存储暂不可用');error.code='SECURE_STORAGE_UNAVAILABLE';throw error;}
 const encrypt=value=>asynchronous?safeStorage.encryptStringAsync(value):Promise.resolve(safeStorage.encryptString(value));
 let value,rotate=false;
 try{const bytes=await fs.readFile(file);if(asynchronous){const decrypted=await safeStorage.decryptStringAsync(bytes);value=typeof decrypted==='string'?decrypted:decrypted.result;rotate=!!decrypted.shouldReEncrypt;}else value=safeStorage.decryptString(bytes);}catch(error){if(error.code!=='ENOENT'){const failure=Error('无法读取设备安全记录');failure.code='DEVICE_IDENTITY_UNAVAILABLE';throw failure;}}
 if(!/^[a-f0-9]{32}$/.test(value||'')){value=crypto.randomBytes(16).toString('hex');rotate=true;}
 if(rotate){await fs.mkdir(userData,{recursive:true});const temporary=file+'.'+process.pid+'.tmp';await fs.writeFile(temporary,await encrypt(value));await fs.rename(temporary,file);}
 return value;
}
module.exports={deviceIdentity};
