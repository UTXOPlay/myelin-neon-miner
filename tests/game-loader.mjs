// DOM integration using the locally pinned test dependencies.
import {JSDOM,VirtualConsole} from 'jsdom';
const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const source=readFileSync('public/game-loader.js','utf8');
function setup(game='neon-miner',embedded=false){
 const dom=new JSDOM('<!doctype html><title>Neon Prospector · UTXOPlay</title><body><main id="game"><button>Play</button></main></body>',{url:`http://localhost/games/${game}/?launch=test`,pretendToBeVisual:true,runScripts:'outside-only',virtualConsole}),w=dom.window,messages=[],frames=[];
 w.requestAnimationFrame=callback=>frames.push(callback);
 const parent={postMessage:(data,origin)=>messages.push({data,origin})};if(embedded)Object.defineProperty(w,'parent',{value:parent});
 w.eval(source);return {w,dom,close(){w.dispatchEvent(new w.Event('pagehide'));dom.window.close();},api:w.UTXOPlayLoader,messages,parent,frame:()=>{const jobs=frames.splice(0);jobs.forEach(cb=>cb());}};
}
for(const {id} of JSON.parse(readFileSync('game-host.json')).games){
 const h=setup(id,true),{api}=h;assert.equal(h.w.document.querySelector('utxo-loader'),null,'embedded uses only the host loader');
 api.boot();api.assets(0,4);api.session();api.ready();assert.equal(api.state.progress,40);assert.equal(api.state.ready,false);
 for(let n=1;n<=4;n++)api.assets(n,4);assert.equal(api.state.progress,85);h.frame();assert.equal(api.state.ready,false);h.frame();assert.equal(api.state.progress,100);assert.equal(api.state.ready,true);
 const before=h.messages.length;h.w.dispatchEvent(new h.w.MessageEvent('message',{source:h.parent,origin:'https://other.invalid',data:{type:'utxoplay:load-request',attempt:'test'}}));assert.equal(h.messages.length,before);
 h.w.dispatchEvent(new h.w.MessageEvent('message',{source:h.parent,origin:'http://localhost',data:{type:'utxoplay:load-request',attempt:'old'}}));assert.equal(h.messages.length,before);
 h.w.dispatchEvent(new h.w.MessageEvent('message',{source:h.parent,origin:'http://localhost',data:{type:'utxoplay:load-request',attempt:'test'}}));assert.equal(h.messages.at(-1).data.ready,true);assert.equal(h.messages.length,before+1);h.close();
}
{
 const h=setup(),surface=h.w.document.querySelector('utxo-loader');assert.ok(surface);assert.ok(h.w.document.getElementById('game').hasAttribute('inert'));h.api.boot();h.api.assets(1,2);h.api.fail('assets');h.api.assets(2,2);h.api.session();h.api.ready();h.frame();h.frame();assert.equal(h.api.state.progress,32);assert.equal(h.api.state.ready,false);assert.match(surface.shadowRoot.querySelector('.help').textContent,/artwork could not load/);
 let retries=0;surface.onRetry=()=>retries++;surface.shadowRoot.querySelector('.retry').click();assert.equal(retries,1);assert.equal(surface.shadowRoot.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),'32');h.close();
}
{
 const h=setup();h.api.boot();h.api.assets(1,1);h.api.session();h.api.ready();h.api.fail('game');h.frame();h.frame();assert.equal(h.api.state.ready,false);assert.equal(h.api.state.progress,85,'a failure between ready and paint cannot report 100');h.close();
}
{
 const h=setup();h.api.boot();h.w.dispatchEvent(new h.w.ErrorEvent('error',{error:new Error('Module crashed')}));assert.ok(h.api.state.error);h.close();
}
{
 const h=setup();h.api.boot();const pending=[];h.w.Image=class{set src(value){this.url=value;}decode(){return new Promise((resolve,reject)=>pending.push({resolve,reject}));}};const result=h.api.images(['a.webp','b.webp']);pending[1].resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.api.state.detail,'1 / 2 artwork assets ready');pending[0].reject(new Error('404'));assert.equal(await result,false);assert.ok(h.api.state.error);h.close();
}
{const h=setup();h.api.boot();h.api.assets(1,1);h.api.session();h.api.ready();h.frame();h.frame();await new Promise(r=>setTimeout(r,650));assert.equal(h.w.document.querySelector('utxo-loader'),null);assert.equal(h.w.document.getElementById('game').hasAttribute('inert'),false);h.close();}
await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(errors,[]);
console.log('Loader contracts: actual gates, frame boundary, late host, stale message, failure, retry and artwork rejection passed.');
