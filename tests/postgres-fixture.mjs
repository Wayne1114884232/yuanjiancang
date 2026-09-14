import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const execute=promisify(execFile);
export async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
export async function postgresFixture(){
  const root=fileURLToPath(new URL('..',import.meta.url));
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'node_modules/embedded-postgres/package.json'),'utf8'));
  const binDir=path.join(root,'node_modules/@embedded-postgres',(process.platform==='win32'?'windows':process.platform)+'-'+process.arch,'native/bin');
  const ext=process.platform==='win32'?'.exe':'',runDir=fs.mkdtempSync(path.join(root,'test-results/pg-'));
  const dataDir=path.join(runDir,'data'),password=randomBytes(18).toString('hex'),pwFile=path.join(runDir,'init-password');
  fs.writeFileSync(pwFile,password,{mode:0o600});
  try{await execute(path.join(binDir,'initdb'+ext),['-D',dataDir,'-U','hub_test','--auth=scram-sha-256','--pwfile='+pwFile,'--locale=C','--encoding=UTF8'],{windowsHide:true,timeout:30000});}finally{fs.rmSync(pwFile,{force:true});}
  const port=await freePort(),url=`postgresql://hub_test:${password}@127.0.0.1:${port}/postgres`;
  const proc=spawn(path.join(binDir,'postgres'+ext),['-D',dataDir,'-p',String(port),'-h','127.0.0.1','-c','fsync=on'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let logs='';proc.stderr.on('data',x=>logs+=x);proc.stdout.on('data',()=>{});
  for(let i=0;i<100;i++){const c=new pg.Client({connectionString:url,ssl:false});try{await c.connect();await c.end();return {url,version:pkg.version,dir:runDir,stop:async()=>{await execute(path.join(binDir,'pg_ctl'+ext),['-D',dataDir,'stop','-m','fast','-w'],{windowsHide:true,timeout:15000});}};}catch{await c.end().catch(()=>{});if(proc.exitCode!==null)throw Error('PostgreSQL failed: '+logs);await new Promise(r=>setTimeout(r,100));}}
  proc.kill();throw Error('PostgreSQL startup timed out: '+logs);
}
