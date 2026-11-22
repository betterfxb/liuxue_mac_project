'use strict';
const fs=require('node:fs'),p=require('node:path'),c=require('node:crypto'),{spawn}=require('node:child_process'),{once}=require('node:events'),rl=require('node:readline');
function applicationSupport(home){
 if(typeof home!=='string'||!p.posix.isAbsolute(home)||p.posix.normalize(home)!==home||home==='/'||home.includes('\0'))throw Error('INVALID_MACOS_HOME');
 return p.posix.join(home,'Library','Application Support','Admissions Workbench');
}
function qaPath(root,parent=__dirname){
 if(parent!==__dirname){
  const nativeTemp=fs.realpathSync(require('node:os').tmpdir());
  if(typeof parent!=='string'||p.dirname(parent)!==nativeTemp||!/^admissions-native-[a-zA-Z0-9]+$/.test(p.basename(parent))||fs.realpathSync(parent)!==parent||!fs.lstatSync(parent).isDirectory())throw Error('UNSAFE_NATIVE_QA_PARENT');
 }
 if(typeof root!=='string'||p.dirname(root)!==parent||!/^synthetic-qa-[a-zA-Z0-9]+$/.test(p.basename(root)))throw Error('SYNTHETIC_ROOT_REQUIRED');
 if(fs.realpathSync(root)!==root||!fs.lstatSync(root).isDirectory())throw Error('UNSAFE_ROOT');
 const file=p.join(root,'.qa-marker'),s=fs.lstatSync(file);
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||fs.readFileSync(file,'utf8')!=='admissions-synthetic-only')throw Error('WRONG_QA_MARKER');
 return root;
}
function verifyInputs(){
 const m=JSON.parse(fs.readFileSync(p.join(__dirname,'BASELINE-INPUT.json'),'utf8'));
 if(!Array.isArray(m)||m.length!==32||new Set(m.map(x=>x.file)).size!==32)throw Error('WRONG_INPUT_MANIFEST');
 for(const x of m){
  if(!x||typeof x.file!=='string'||!/^[A-Za-z0-9_.\/-]+$/.test(x.file)||x.file.split('/').some(v=>!v||v==='.'||v==='..')||!/^[0-9A-F]{64}$/.test(x.sha256))throw Error('INVALID_INPUT_ENTRY');
  const f=p.resolve(__dirname,x.file);
  const st=fs.lstatSync(f);
  if(!f.startsWith(__dirname+p.sep)||!st.isFile()||st.isSymbolicLink()||st.nlink!==1||fs.realpathSync(f)!==f)throw Error('INVALID_INPUT_PATH');
  if(c.createHash('sha256').update(fs.readFileSync(f)).digest('hex').toUpperCase()!==x.sha256)throw Error('INPUT_HASH_MISMATCH');
 }
 return m.length;
}
async function launch({mode,root,qaParent=__dirname}={}){
 if(mode!=='synthetic-qa')throw Error('CUSTOMER_BUILD_BLOCKED: protected macOS storage not integrated');
 qaPath(root,qaParent);const files=verifyInputs();
 const lock=p.join(root,'.admissions-launch.lock'),nonce=c.randomBytes(32).toString('hex');
 fs.writeFileSync(lock,nonce,{flag:'wx'});
 function release(){if(fs.readFileSync(lock,'utf8')===nonce)fs.unlinkSync(lock);}
 let child;
 try{child=spawn(process.execPath,['--experimental-sqlite',p.join(__dirname,'server-qa.cjs'),root],
  {cwd:__dirname,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot??'',TEMP:process.env.TEMP??'',TMP:process.env.TMP??'',TMPDIR:process.env.TMPDIR??'',ADMISSIONS_QA_PARENT:qaParent,ADMISSIONS_QA_PROOF:nonce}});
 }catch(e){release();throw e;}
 child.stderr.resume();child.stdin.on('error',()=>{});
 const exited=new Promise(resolve=>{child.once('close',(code,signal)=>resolve({code,signal}));child.once('error',()=>{});});
 const read=rl.createInterface({input:child.stdout});
 let stopping;
 function stop(){return stopping??=(async()=>{
   if(child.exitCode===null&&child.signalCode===null)child.stdin.end('STOP\n');
   const timer=setTimeout(()=>child.kill(),4000);
   try{const {code}=await exited;return {graceful:code===0,pid:child.pid};}finally{clearTimeout(timer);release();}
 })();}
 try{
  const timer=setTimeout(()=>child.kill(),8000);
  let line;
  try{line=await Promise.race([once(read,'line').then(([v])=>v),exited.then(()=>{throw Error('BACKEND_NOT_READY')})]);}
  finally{clearTimeout(timer);read.close();}
  const m=/^READY (http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4}))$/.exec(line);
  if(!m||Number(m[2])>65535)throw Error('INVALID_READY_ADDRESS');
  const origin=m[1];
  const res=await fetch(origin+'/__ready',{headers:{'x-admissions-launch-proof':nonce},redirect:'error',signal:AbortSignal.timeout(2500)});
  const health=await res.json();
  if(!res.ok||health.product!=='admissions-workbench'||health.scope!=='synthetic-qa'||health.ready!==true)throw Error('WRONG_HEALTH_IDENTITY');
  return {origin,page:origin+'/#/apply',pid:child.pid,files,stop};
 }catch(e){await stop();throw e;}
}
module.exports={launch,qaPath,applicationSupport};