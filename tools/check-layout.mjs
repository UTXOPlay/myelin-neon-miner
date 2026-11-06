// npm run build first. This serves real built UI/art with a local prediction-engine
// API fixture; it does not create native signed saves or contact production.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tools/check-layout.mjs
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createGame,apply} from '../games/neon-miner/web/engine.mjs';
import {mineViewport,pointerInMine} from '../games/neon-miner/web/viewport.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(import.meta.dirname,'../dist/neon-miner');
const output=path.resolve(process.env.CAPTURE_DIR||'artifacts/layout-review');mkdirSync(output,{recursive:true});
let game=createGame(),actions=0;
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),prefix='/games/neon-miner/';
 if(!url.pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
 const name=url.pathname.slice(prefix.length);
 if(name.startsWith('api/')){
  let body='';for await(const c of req)body+=c;const request=body?JSON.parse(body):{};
  res.setHeader('Content-Type','application/json');
  if(name==='api/guest'||name==='api/me'){res.end(JSON.stringify({user:{id:'layout-fixture',guest:true}}));return;}
  if(name==='api/action'){apply(game,request.action);actions++;}
  if(name==='api/new')game=createGame();
  res.end(JSON.stringify({game,session:{id:'layout-fixture',block_hash:'0'.repeat(64),actions}}));return;
 }
 if(!name&&url.searchParams.has('level')){
  game=createGame();for(let level=1;level<Number(url.searchParams.get('level'));level++){game.mode='cleared';apply(game,{type:'next'});}
 }
 const file=path.resolve(root,name||'index.html');
 if(!file.startsWith(root+path.sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/games/neon-miner/`;
const browser=await chromium.launch({args:['--no-sandbox']}),errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},hasTouch:true,deviceScaleFactor:2,isMobile:true,reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const raf=requestAnimationFrame.bind(window);
  window.requestAnimationFrame=fn=>raf(t=>{if(!window.captureFreeze)fn(t);});
 });
 await page.goto(url);await page.waitForFunction(()=>globalThis.UTXOPlayLoader?.state.ready);
 await page.locator('utxo-loader').waitFor({state:'detached'});
 await page.locator('#play').click();await page.waitForTimeout(100);
 await page.evaluate(()=>window.captureFreeze=true);await page.waitForTimeout(60);
 for(const [width,height] of [[1920,1080],[2560,1080],[2560,1440],[3840,2160],[844,390]]){
  await page.setViewportSize({width,height});
  await page.waitForFunction(([w,h])=>{const c=document.querySelector('#mine');return Math.abs(c.getBoundingClientRect().width-w)<1&&Math.abs(c.getBoundingClientRect().height-h)<1},[width,height],{timeout:5000}).catch(async e=>{console.log(await page.evaluate(()=>({inner:[innerWidth,innerHeight],field:document.querySelector('.field').getBoundingClientRect().toJSON(),canvas:document.querySelector('#mine').getBoundingClientRect().toJSON(),body:document.body.getBoundingClientRect().toJSON(),errors:window.captureFreeze})));throw e});
  await page.waitForTimeout(80);
  const check=await page.evaluate(()=>{
   const c=document.querySelector('#mine'),r=c.getBoundingClientRect(),m=c.getContext('2d').getTransform(),field=document.querySelector('.field'),style=getComputedStyle(field);
   const rect=selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,font:parseFloat(getComputedStyle(e).fontSize)}};
   return {backing:[c.width,c.height],canvas:[r.width,r.height],scaleX:m.a/(c.width/r.width),scaleY:m.d/(c.height/r.height),x:m.e/(c.width/r.width),y:m.f/(c.height/r.height),insets:Object.fromEntries(['top','right','bottom','left'].map(s=>[s,parseFloat(style.getPropertyValue('--mine-safe-'+s))||0])),overflow:document.body.scrollWidth>innerWidth,ui:Object.fromEntries(['.mine-status','.dock','.wordmark','.game-myelin-badge','#menu','#scanner','#wallet','#emp','#boost','#clock','#stasis','#time'].map(s=>[s,rect(s)])),statusScroll:document.querySelector('.mine-status').scrollHeight>document.querySelector('.mine-status').clientHeight};
  });
  const view=mineViewport(width,height,check.insets);
  assert.deepEqual(check.canvas,[width,height]);assert.ok(check.backing[0]*check.backing[1]<=8294400);
  assert.ok(Math.abs(check.scaleX-view.scale)<1e-6,JSON.stringify({width,height,actual:check.scaleX,expected:view.scale}));assert.ok(Math.abs(check.scaleY-view.scale)<1e-6);
  assert.ok(Math.abs(check.x-view.x)<1e-4&&Math.abs(check.y-view.y)<1e-4);
  assert.equal(check.overflow,false);assert.equal(check.statusScroll,false,'status should fit without a nested scroll');
  for(const [selector,r]of Object.entries(check.ui)){
   assert.ok(r.x>=-1&&r.y>=-1&&r.x+r.width<=width+1&&r.y+r.height<=height+1,`${selector} fits ${width}x${height}: ${JSON.stringify(r)}`);
   if(selector.startsWith('#')&&selector!=='#time')assert.ok(r.height>=44,selector+' touch height');
  }
  for(const selector of ['.mine-status','.dock','.wordmark','.game-myelin-badge','#menu']){
   const r=check.ui[selector];assert.ok(r.x+r.width<=view.x+1||r.x>=view.x+1000*view.scale-1,selector+' stays beside the playfield');
  }
  for(const [x,y]of [[500,100],[25,650],[975,650],[120,280],[880,600]]){
   const p=pointerInMine(view.x+x*view.scale,view.y+y*view.scale,{left:0,top:0,width,height},view);
   assert.ok(Math.hypot(p.x-x,p.y-y)<1e-8);
  }
  if(width===844)assert.ok(view.scale>=.5,'phone mine must use nearly the full scene height');
  await page.screenshot({path:path.join(output,`mine-${width}x${height}.png`)});
  results.push({width,height,...check});
 }
 await page.setViewportSize({width:390,height:844});await page.locator('#game-orientation-gate').waitFor({state:'visible'});
 await page.locator('#game-orientation-gate button').click({trial:true});
 await page.screenshot({path:path.join(output,'mine-390x844.png')});
 await page.close();
 // Live input: tapping the rendered field starts a cast, and rotating cannot
 // keep mining in the background.
 game=createGame();const touch=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});touch.on('pageerror',e=>errors.push(e.message));
 await touch.goto(url);await touch.waitForFunction(()=>globalThis.UTXOPlayLoader?.state.ready);await touch.locator('utxo-loader').waitFor({state:'detached'});
 await touch.locator('#play').click();const v=mineViewport(844,390);await touch.touchscreen.tap(v.x+500*v.scale,v.y+300*v.scale);
 await touch.waitForTimeout(1100);assert.ok(game.tick>0&&game.phase!==0,'tap enters an actual cast');
 await touch.setViewportSize({width:390,height:844});await touch.locator('#game-orientation-gate').waitFor({state:'visible'});
 await touch.waitForTimeout(300);const paused=game.tick;await touch.waitForTimeout(600);assert.equal(game.tick,paused);
 await touch.setViewportSize({width:844,height:390});await touch.locator('#game-orientation-gate').waitFor({state:'hidden'});
 await touch.locator('#menu').click();await touch.locator('[data-tab=items]').click();assert.equal(await touch.locator('#shop').isVisible(),true);
 await touch.screenshot({path:path.join(output,'mine-phone-store.png')});
 await touch.close();assert.deepEqual(errors,[]);
 writeFileSync(path.join(output,'report.json'),JSON.stringify({fixture:true,errors,results},null,2));
 console.log('PASS: six display sizes, isotropic rendering/inverse mapping, bounded backing resolution, side-rail separation, legibility/touch targets, real UI cast, portrait pause, in-scene store.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
