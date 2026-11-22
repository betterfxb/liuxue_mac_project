'use strict';
const fs=require('node:fs'),p=require('node:path'),c=require('node:crypto'),a=require('node:assert/strict');
a.equal(process.argv.length,3);
const source=p.resolve(__dirname,'..'),target=p.resolve(process.argv[2]);
const manifest=JSON.parse(fs.readFileSync(p.join(source,'BASELINE-INPUT.json'),'utf8'));
a.equal(manifest.length,32);a.equal(new Set(manifest.map(x=>x.file)).size,32);
function copy(file,pin){
 if(!/^[a-zA-Z0-9_.\/-]+$/.test(file)||file.split('/').some(x=>x==='.'||x==='..'||x===''))throw Error('Invalid runtime relative path');
 const from=p.join(source,file),to=p.join(target,file);
 const st=fs.lstatSync(from);a.ok(st.isFile()&&!st.isSymbolicLink()&&fs.realpathSync(from)===from);
 const buf=fs.readFileSync(from);
 if(pin)a.equal(c.createHash('sha256').update(buf).digest('hex').toUpperCase(),pin);
 fs.mkdirSync(p.dirname(to),{recursive:true});fs.writeFileSync(to,buf,{flag:'wx'});
}
for(const x of manifest){a.ok(/^[0-9A-F]{64}$/.test(x.sha256));copy(x.file,x.sha256)}
copy('BASELINE-INPUT.json');
console.log('Staged 33 checked workbench files without dependencies or data');