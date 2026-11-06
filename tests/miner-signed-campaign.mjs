// Real gateway + native authority, full campaign, original-command recovery and UI.
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {createGame,apply} from '../games/neon-miner/web/engine.mjs';
import {CommandClient,commandRequest} from '../games/neon-miner/web/commands.mjs';
import {createGameHost} from '../host/server.mjs';
import {install} from '../host/items.mjs';
const bin=resolve(process.env.MINER_BIN||'target/debug/myelin-neon-miner');
const dir=process.env.MINER_EVIDENCE_OUT||mkdtempSync('/tmp/miner-signed-campaign-');mkdirSync(dir,{recursive:true});
assert.equal(existsSync(join(dir,'native')),false,'Campaign evidence must start with a fresh native namespace');
const token=randomBytes(32).toString('hex'),origin='http://127.0.0.1:19091',runtime='http://127.0.0.1:19097';
let child,service,server,loseReply=false,loseStatus=false;
async function runtimeFetch(url,options){const result=await fetch(url,options);if(loseReply&&(url.endsWith('/action')||url.endsWith('/new'))&&result.ok){loseReply=false;await result.arrayBuffer();throw Error('lost response after native commit');}if(loseStatus&&url.includes('/commands/')&&result.ok){loseStatus=false;await result.arrayBuffer();throw Error('lost command status');}return result;}
async function launch(){
 child=spawn(bin,[],{env:{...process.env,PORT:'19097',BIND:'127.0.0.1',RUNTIME_TOKEN:token,DATA_DIR:join(dir,'native')},stdio:['ignore','pipe','inherit']});
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('exit',code=>reject(Error('Native exited '+code)));child.once('error',reject);});
 service=createGameHost({config:{name:'miner-command-test',games:[{id:'neon-miner',webRoot:'dist/neon-miner',runtimePath:'/neon-miner'}]},origin,runtimeUrl:runtime,runtimeToken:token,fetchImpl:runtimeFetch,install});
 server=service.app.listen(19091,'127.0.0.1');await new Promise(r=>server.once('listening',r));
}
async function stop(){const oldService=service,oldServer=server,oldChild=child;service=server=child=null;oldService?.close();if(oldServer)await new Promise(r=>oldServer.close(r));if(oldChild&&oldChild.exitCode===null&&oldChild.signalCode===null){const exited=new Promise(r=>oldChild.once('exit',r));oldChild.kill('SIGKILL');await exited;}}
async function guest(){const r=await fetch(origin+'/api/guest',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,200);return {cookie:r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; '),user:(await r.json()).user};}
async function req(endpoint,body,user,status=200){const r=await fetch(origin+'/games/neon-miner/api/'+endpoint,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:user.cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();assert.equal(r.status,status,JSON.stringify(v));return v;}
const pending=new Map(),storage={getItem:k=>pending.get(k)??null,setItem:(k,v)=>pending.set(k,v),removeItem:k=>pending.delete(k)};
function client(user){return new CommandClient(async(endpoint,body)=>{const r=await fetch(origin+'/games/neon-miner/api/'+endpoint,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:user.cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(v.error);return v;},storage,()=>user.user.id+'/expedition');}
async function uiFlow(){await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['tests/miner-flow.mjs'],{env:{...process.env,STORE_URL:origin,MINER_FLOW_OUT:join(dir,'ui')},stdio:'inherit'});p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(Error('Miner UI flow exited '+code)));});}
try {
 await launch();
 // Fail controller checks before the long campaign; each uses its own guest.
 await uiFlow();
 const user=await guest(),other=await guest();let commands=client(user),state=await req('state',undefined,user),start=structuredClone(state),g=createGame();
 assert.deepEqual(state.game,g);const untouched=await req('state',undefined,other);assert.notEqual(state.session.id,untouched.session.id);
 let count=0,purchases=0,firstOriginal,firstReceipt;
 for(const action of JSON.parse(readFileSync('tests/neon-miner-solutions.json'))){
  const original=commandRequest(state,action);
  if(count===0){
   firstOriginal=original;loseReply=true;loseStatus=true;
   await assert.rejects(commands.submitOriginal(state,original));assert.equal(pending.size,1);
   await stop();await launch();commands=client(user);
   state=await commands.recover(await req('state',undefined,user));assert.equal(pending.size,0);firstReceipt=state.command;
  }else state=await commands.submitOriginal(state,original);
  assert.ok(state.command.entry.status.Committed.outcome.Succeeded,JSON.stringify(state.command.entry.status));
  apply(g,action);assert.deepEqual(state.game,g);count++;
  if(action.type==='buy'){
   purchases++;const repeated=await req('action',original,user);assert.deepEqual(repeated.command,state.command);assert.deepEqual(repeated.session,state.session);assert.deepEqual(repeated.game,g);
  }
  if(action.type==='next'&&g.level%15===0)console.log('Signed sector',g.level);
 }
 assert.equal(g.level,60);assert.equal(g.mode,'complete');assert.equal(state.session.actions,count);assert.equal(state.session.ckb_settled,false);assert.equal(g.coins,g.earned-g.spent);
 assert.deepEqual((await req('state',undefined,other)).game,untouched.game);
 assert.deepEqual((await req('commands/'+firstOriginal.session_id+'/'+firstOriginal.command_id,undefined,user)),firstReceipt);
 const late=await req('action',firstOriginal,user);assert.deepEqual(late.command,firstReceipt);assert.deepEqual(late.session,state.session);
 await req('action',commandRequest(start,{type:'ticks',inputs:[1]}),user,400);
 await req('action',{...firstOriginal,action:{type:'ticks',inputs:[0]}},user,400);
 await req('action',firstOriginal,other,400);
 await req('commands/'+firstOriginal.session_id+'/'+firstOriginal.command_id,undefined,other,400);
 const rejected=await commands.submit(state,{type:'buy',item:'winch',price:0});assert.ok(rejected.command.entry.status.Committed.outcome.Rejected);assert.deepEqual(rejected.game,g);state=rejected;
 const replay=await req('replay',{},user);assert.equal(replay.verified,true);assert.equal(replay.frames,count+1);
 const file=join(dir,'expedition.json');writeFileSync(file,JSON.stringify(await req('export',undefined,user)));
 const completed=structuredClone(state);await stop();await launch();state=await req('state',undefined,user);assert.deepEqual(state.game,completed.game);assert.deepEqual(state.session,completed.session);
 loseReply=true;loseStatus=true;commands=client(user);await assert.rejects(commands.submit(state,{type:'new_game'}));assert.equal(pending.size,1);
 const originalNew=JSON.parse([...pending.values()][0]);await stop();await launch();commands=client(user);
 state=await commands.recover(await req('state',undefined,user));assert.equal(pending.size,0);assert.notEqual(state.session.id,completed.session.id);assert.equal(state.game.tick,0);
 assert.deepEqual((await req('new',originalNew,user)).command,state.command);await req('new',{},user,400);
 await stop();rmSync(join(dir,'native'),{recursive:true});
 const verified=spawnSync(bin,['verify',file],{encoding:'utf8'});assert.equal(verified.status,0,verified.stderr);assert.equal(JSON.parse(verified.stdout).state_root,completed.session.state_root);
 writeFileSync(join(dir,'offline.json'),verified.stdout);
 const report={sectors:60,commands:count,purchases,frames:replay.frames,game:g,recovered:true,offlineVerified:true,originalDatabasesRemoved:true,originalReceipts:true,clientReload:true,lostNewGame:true,ui:'DOM plus native Canvas and real authenticated HTTP/native runtime'};
 writeFileSync(join(dir,'campaign.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,game:undefined,evidence:file}));
}finally{await stop();}
