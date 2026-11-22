'use strict';
const fs=require('node:fs'),p=require('node:path'),os=require('node:os'),{launch}=require('./launch.cjs');
const message=x=>process.stdout.write(JSON.stringify(x)+'\n');
(async()=>{
 if(process.argv.length!==3||process.argv[2]!=='--synthetic-qa')throw Error('CUSTOMER_BUILD_BLOCKED');
 let host,requested=false;
 const stop=()=>{requested=true;if(host)void finish();};
 let finishing;
 function finish(){
  return finishing??=(async()=>{
   process.stdin.pause();
   const outcome=await host.stop();
   message({event:'stopped',graceful:outcome.graceful});
   process.exitCode=outcome.graceful?0:1;
  })();
 }
 process.stdin.resume();
 process.stdin.once('data',stop);
 process.stdin.once('end',stop);
 const dir=fs.mkdtempSync(p.join(fs.realpathSync(os.tmpdir()),'admissions-native-'));
 const root=fs.mkdtempSync(p.join(dir,'synthetic-qa-'));
 fs.writeFileSync(p.join(root,'.qa-marker'),'admissions-synthetic-only',{flag:'wx',mode:0o600});
 host=await launch({mode:'synthetic-qa',qaParent:dir,root});
 if(requested){await finish();return;}
 message({event:'ready',scope:'synthetic-qa',url:host.page});
})().catch(()=>{
 process.stdin.pause();
 message({event:'error',code:'ADMISSIONS_QA_START_BLOCKED'});
 process.exitCode=2;
});