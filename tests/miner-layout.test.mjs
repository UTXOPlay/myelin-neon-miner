import test from 'node:test';
import assert from 'node:assert/strict';
import {mineViewport,pointerInMine,backingRatio} from '../games/neon-miner/web/viewport.mjs';
import {createGame,apply} from '../games/neon-miner/web/engine.mjs';
const sizes=[[1920,1080],[2560,1080],[2560,1440],[3840,2160],[390,844],[844,390],[667,375]];
test('fixed mine geometry fits every viewport and the pointer transform is its inverse',()=>{
 for(const [width,height]of sizes)for(const insets of [{},{left:44,right:44,top:0,bottom:21}]){
  const v=mineViewport(width,height,insets);
  assert.ok(v.scale>0);assert.ok(v.x>=0&&v.y>=0);
  assert.ok(v.x+1000*v.scale<=width+1e-8&&v.y+700*v.scale<=height+1e-8);
  const rect={left:27,top:53,width,height};
  for(const [x,y]of [[0,0],[1000,700],[500,100],[25,650],[975,650],[120,280]]){
   const p=pointerInMine(rect.left+v.x+x*v.scale,rect.top+v.y+y*v.scale,rect,v);
   assert.ok(Math.hypot(p.x-x,p.y-y)<1e-8);
  }
  if(v.wide){assert.ok(v.left>=Math.max(insets.left||0,10));assert.ok(v.right>=Math.max(insets.right||0,10));assert.ok(v.left+v.rail<=v.x);assert.ok(width-v.right-v.rail>=v.x+1000*v.scale-1e-8);}
 }
});
test('landscape phone gives the mine its height back and large HUD scales are bounded',()=>{
 const phone=mineViewport(844,390);
 const previousScale=(390-100-76)/700;
 assert.ok(phone.scale/previousScale>1.7);
 assert.ok(700*phone.scale>=370-1e-8);
 assert.equal(mineViewport(3840,2160).ui,2);
 assert.equal(mineViewport(2560,1080).ui,1);
 assert.equal(mineViewport(2560,1440).ui,4/3);
});
test('ore sprites in all sixty sectors fit the fixed mine without moving rule coordinates',()=>{
 const g=createGame();
 for(let level=1;level<=60;level++){
  const before=structuredClone(g);
  for(const [width,height]of sizes){
   const v=mineViewport(width,height);
   for(const ore of g.ores){
    const bleed=ore.radius*1.125,drift=ore.vx?25+Math.floor((level-1)/15)*8:0;
    assert.ok(ore.anchor-drift-bleed>=0&&ore.anchor+drift+bleed<=1000);
    assert.ok(ore.y-bleed>=0&&ore.y+bleed<=700);
    const px=v.x+ore.x*v.scale,py=v.y+ore.y*v.scale;
    assert.ok(px>=0&&px<=width&&py>=0&&py<=height);
   }
  }
  assert.deepEqual(g,before,'layout never rewrites game state');
  if(level<60){g.mode='cleared';apply(g,{type:'next'});}
 }
});
test('all display sizes and DPR/quality levels stay within the backing pixel budget',()=>{
 for(const [w,h]of sizes)for(const dpr of [.75,1,1.25,1.5,2,3,4]){
  const ratio=backingRatio(w,h,dpr);assert.ok(ratio<=dpr);
  assert.ok(Math.floor(w*ratio)*Math.floor(h*ratio)<=8294400);
 }
});
