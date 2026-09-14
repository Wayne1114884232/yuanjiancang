export class LiveUpdates {
  constructor(store,interval=3000){this.store=store;this.interval=interval;this.watchers=new Set();this.timer=null;this.running=false;this.closed=false;}
  add(req,res,key,lid){
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write('retry: 3000\n: connected\n\n');const watcher={res,key,lid,last:null};this.watchers.add(watcher);
    res.on('close',()=>{this.watchers.delete(watcher);if(!this.watchers.size){clearTimeout(this.timer);this.timer=null;}});
    this.schedule(0);
  }
  schedule(delay=this.interval){if(this.closed||this.running||this.timer||!this.watchers.size)return;this.timer=setTimeout(()=>{this.timer=null;this.tick();},delay);this.timer.unref?.();}
  async tick(){if(this.running||this.closed||!this.watchers.size)return;this.running=true;const batch=[...this.watchers];
    try{const states=await this.store.watchStates(batch);for(let i=0;i<batch.length;i++){const w=batch[i],state=states[i];if(w.res.destroyed)continue;if(state.revoked){w.res.end('event: revoked\ndata: {}\n\n');this.watchers.delete(w);continue;}const data=JSON.stringify(state);if(data!==w.last){w.res.write('data: '+data+'\n\n');w.last=data;}else w.res.write(': heartbeat\n\n');}}
    catch{for(const w of batch)if(!w.res.destroyed)w.res.write('event: unavailable\ndata: {}\n\n');}
    finally{this.running=false;this.schedule();}
  }
  close(){this.closed=true;clearTimeout(this.timer);for(const w of this.watchers)w.res.end();this.watchers.clear();}
}
