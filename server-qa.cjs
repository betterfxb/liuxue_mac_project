'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=process.argv[2];
assert.ok(root&&/^synthetic-qa-[a-zA-Z0-9]+$/.test(path.basename(root)));
assert.equal(fs.realpathSync(root),root);
assert.equal(fs.readFileSync(path.join(root,'.qa-marker'),'utf8'),'admissions-synthetic-only');
const launchProof=process.env.ADMISSIONS_QA_PROOF;
assert.match(launchProof??'',/^[a-f0-9]{64}$/);
delete process.env.ADMISSIONS_QA_PROOF;
require('./launch.cjs').qaPath(root,process.env.ADMISSIONS_QA_PARENT); delete process.env.ADMISSIONS_QA_PARENT;
const db=path.join(root,'admissions.sqlite');
if(fs.existsSync(db)){ const s=fs.lstatSync(db);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1); }
Object.assign(process.env,{DB_PATH:db,NODE_ENV:'test',APP_ENV:'test',PORT:'0',HOST:'127.0.0.1',
 JWT_SECRET:crypto.randomBytes(48).toString('hex'),SCHEDULER_ENABLED:'0',RATE_LIMIT_ENABLED:'1',ADMISSIONS_SYNTHETIC_PDF:'1',ADMISSIONS_SYNTHETIC_PICK_PDF:'1'});
global.fetch=async()=>{throw Error('QA_OUTBOUND_DISABLED')};
const req=require('node:module').createRequire(path.join(__dirname,'api/package.json'));
req('reflect-metadata');
const {NestFactory}=req('@nestjs/core');
const {AdmissionsModule}=req('./dist/admissions.module');
const api=/^\/api\/v1\/(?:auth\/(?:register|login|refresh|logout)|institutions|applications(?:\/\d+(?:\/recommenders(?:\/\d+\/invite)?|\/hku-r367-plan|\/hku-r367-local-pdf(?:\/preview)?|\/hku-r367-select-pdf(?:\/(?:preview|page))?)?)?)$/;
(async()=>{
 const app=await NestFactory.create(AdmissionsModule,{logger:false,abortOnError:false});
 app.use((q,s,next)=>{if(q.path.startsWith('/api/')&&!api.test(q.path))return s.status(404).json({code:2001,message:'Not in admissions QA'});next();});
 app.use((q,s,next)=>{
 if(q.path==='/__ready'){
  if(q.method!=='GET'||q.get('x-admissions-launch-proof')!==launchProof)return s.sendStatus(404);
  return s.set('cache-control','no-store').json({ready:true,product:'admissions-workbench',scope:'synthetic-qa'});
 }
 s.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 next();
 });
 app.use(req('express').static(path.join(__dirname,'console','dist'),{dotfiles:'deny'}));
 app.enableShutdownHooks();
 await app.listen(0,'127.0.0.1');
 process.stdout.write('READY '+await app.getUrl()+'\n');
 process.stdin.resume();
 let stopping=false; const stop=()=>{if(stopping)return;stopping=true;process.stdin.pause();app.getHttpServer().closeAllConnections();void app.close().then(()=>process.exit(0),()=>process.exit(1));}; process.stdin.once('data',stop); process.stdin.once('end',stop);
})().catch(e=>{process.stderr.write('ADMISSIONS_QA_START_FAILED '+String(e?.message).slice(0,400)+'\n');process.exitCode=1;});