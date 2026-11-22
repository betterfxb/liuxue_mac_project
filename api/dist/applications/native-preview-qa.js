'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {BizError}=require('../common/biz-error');
const pins=new Map([
 ['c18425b64614e3f03b5fe03ee49dbd1051e891b0cc4471e0734a801de7bfbd54',759],
 ['af4f7eea4a63240ec249b0f835bce18a9f66fa3d73c0626e4ff8b2af2674ae5d',759],
 ['88e2bcc6fe0ac708885c436527f8d0d6e1002f46565d23ecd25d45d344796f37',1240],
]);
let active=0;
const rejected=(status,message)=>new BizError(1001,message,status);
function renderSyntheticPreview(bytes){
 if(process.platform!=='darwin'||process.env.NODE_ENV!=='test'||process.env.APP_ENV!=='test'
    ||process.env.ADMISSIONS_SYNTHETIC_PICK_PDF!=='1'||path.basename(process.execPath)!=='admissions-node')
   throw rejected(422,'SYNTHETIC_MAC_PREVIEW_UNAVAILABLE');
 if(!Buffer.isBuffer(bytes)||bytes.length<759||bytes.length>1240
    ||pins.get(crypto.createHash('sha256').update(bytes).digest('hex'))!==bytes.length)
   throw rejected(422,'SYNTHETIC_MAC_PREVIEW_REJECTED');
 if(active>=2)throw rejected(429,'SYNTHETIC_MAC_PREVIEW_BUSY');
 const exe=path.join(path.dirname(process.execPath),'AdmissionsWorkbench');
 try{if(!fs.lstatSync(exe).isFile()||fs.realpathSync(exe)!==exe)throw Error('unsafe path');fs.accessSync(exe,fs.constants.X_OK);}
 catch{throw rejected(422,'SYNTHETIC_MAC_PREVIEW_UNAVAILABLE');}
 ++active;
 return new Promise((resolve,reject)=>{
   let child;
   try{child=spawn(exe,['--render-synthetic-page-v1'],{stdio:['pipe','pipe','ignore'],env:{}});}
   catch{--active;reject(rejected(422,'SYNTHETIC_MAC_PREVIEW_FAILED'));return;}
   let failed=false, size=0;const chunks=[];
   const kill=()=>{failed=true; child.kill('SIGKILL');};
   const timer=setTimeout(kill,4500);
   child.stdout.on('data',chunk=>{size+=chunk.length;if(size>4194304)kill();else chunks.push(chunk);});
   child.stdin.on('error',()=>{failed=true;});
   child.once('error',()=>{failed=true;});
   child.once('close',code=>{
     clearTimeout(timer);--active;
     const png=Buffer.concat(chunks);
     if(failed||code!==0||png.length<100||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'
        ||png.subarray(12,16).toString()!=='IHDR'||png.readUInt32BE(16)<1||png.readUInt32BE(16)>1000
        ||png.readUInt32BE(20)<1||png.readUInt32BE(20)>1400){
       reject(rejected(422,'SYNTHETIC_MAC_PREVIEW_FAILED'));return;
     }
     resolve(png);
   });
   child.stdin.end(bytes);
 });
}
module.exports={renderSyntheticPreview};
