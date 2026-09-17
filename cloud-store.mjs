import pg from 'pg';
import {TeamEngine,emptyDocument,check} from './team-engine.mjs';

// A database commit is the only successful write. No local SQLite mirror or deferred flush.
export function databaseOptions(connectionString,allowLocal=false){
  check(connectionString,'请先在云平台设置 DATABASE_URL，禁止使用临时磁盘保存库存');
  const u=new URL(connectionString);check(['postgres:','postgresql:'].includes(u.protocol),'DATABASE_URL 须为 PostgreSQL 连接地址');
  const local=['127.0.0.1','localhost','[::1]'].includes(u.hostname);
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(key);
  return {connectionString:u.toString(),ssl:allowLocal&&local?false:{rejectUnauthorized:true},max:4,idleTimeoutMillis:10000,connectionTimeoutMillis:20000,statement_timeout:20000};
}
const reads=new Set(['me','state','team','backup','share','ownerRecoveryLog']);
const methods=[...reads,'configureOwner','ownerRecoveryCreate','register','login','logout','passwordChange','recoveryCreate','recover','action','teamAction','approve','transfer','importLegacy','feedCommit','priceStatus'];
export class CloudStore {
  constructor(pool){this.pool=pool;this.pool.on('error',()=>{});}
  async initialize(){
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(74821904)');
      await client.query('CREATE TABLE IF NOT EXISTS hub_metadata (id integer PRIMARY KEY CHECK(id=1), body jsonb NOT NULL)');
      await client.query('CREATE TABLE IF NOT EXISTS hub_libraries (id text PRIMARY KEY, body jsonb NOT NULL)');
      const doc=emptyDocument();delete doc.libraries;
      await client.query('INSERT INTO hub_metadata VALUES (1,$1::jsonb) ON CONFLICT (id) DO NOTHING',[JSON.stringify(doc)]);
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  }
  async run(name,args){
    check(methods.includes(name),'接口不受支持');
    const client=await this.pool.connect(),readonly=reads.has(name);
    try{
      await client.query(readonly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
      // Writers serialize at the database, including during rolling deploys and across processes.
      const {rows:[metadata]}=await client.query('SELECT body FROM hub_metadata WHERE id=1'+(readonly?'':' FOR UPDATE'));
      check(metadata?.body.schema===2,'数据库结构需要升级，服务暂不接受写入',503);
      const libraries=(await client.query('SELECT body FROM hub_libraries ORDER BY id')).rows.map(x=>x.body);
      const original=new Map(libraries.map(x=>[x.id,JSON.stringify(x)]));
      const engine=new TeamEngine({...metadata.body,libraries}),result=await engine[name](...args);
      if(engine.changed){
        check(!readonly,'只读请求不能修改数据库');
        const next=engine.document,{libraries:changed,...meta}=next;
        for(const lib of changed){const body=JSON.stringify(lib);if(body!==original.get(lib.id))await client.query('INSERT INTO hub_libraries(id,body) VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET body=EXCLUDED.body',[lib.id,body]);original.delete(lib.id);}
        for(const id of original.keys())await client.query('DELETE FROM hub_libraries WHERE id=$1',[id]);
        await client.query('UPDATE hub_metadata SET body=$1::jsonb WHERE id=1',[JSON.stringify(meta)]);
      }
      await client.query('COMMIT');
      return result;
    }catch(e){await client.query('ROLLBACK').catch(()=>{});if(!e.status&&/^(08|53|57|58)/.test(e.code||''))e.status=503;throw e;}finally{client.release();}
  }
  async watchStates(watchers){
    if(!watchers.length)return [];
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const {rows:[{body}]}=await client.query('SELECT body FROM hub_metadata WHERE id=1');
      const libraries=(await client.query("SELECT id, body->'state'->>'rev' AS rev FROM hub_libraries")).rows;
      const revisions=new Map(libraries.map(x=>[x.id,Number(x.rev)])),engine=new TeamEngine({...body,libraries:[]});
      const result=watchers.map(w=>{try{const {user}=engine.auth(body,w.key);check(body.members.some(x=>x.userId===user.id&&x.libraryId===w.lid)&&revisions.has(w.lid),'权限已撤销',403);return {rev:revisions.get(w.lid),revision:body.revision};}catch{return {revoked:true};}});
      await client.query('COMMIT');return result;
    }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  }
  async close(){await this.pool.end();}
}
for(const name of methods)CloudStore.prototype[name]=function(...args){return this.run(name,args);};
export async function openCloudStore(url=process.env.DATABASE_URL){const store=new CloudStore(new pg.Pool(databaseOptions(url,process.env.ALLOW_LOCAL_DATABASE==='true')));try{await store.initialize();return store;}catch(e){await store.close();throw e;}}
