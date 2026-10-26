import {shop,priceFor} from '../dist/neon-miner/engine.mjs';
export function install({app,account,runtimeFetch,runtimeUrl,runtimeToken}){
 app.get('/games/neon-miner/api/items',async(req,res)=>{
  try{
   const user=account(req);let state;
   if(user){const r=await runtimeFetch(runtimeUrl+'/neon-miner/api/state',{headers:{'X-Runtime-Token':runtimeToken,'X-UTXOPlay-Account':user.id},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Inventory unavailable');state=(await r.json()).game;}
   res.json({balance:state?.coins??null,items:shop.map(i=>({id:i.id,name:i.name,desc:i.desc,type:i.upgrade?'Rig upgrade':'Consumable',upgrade:!!i.upgrade,image:`/games/neon-miner/art/${i.art}.webp`,price:state?priceFor(state,i):i.price,priceIsMinimum:!state,owned:state?(i.upgrade?state[i.upgrade]:state.stock[i.slot]):null,maxOwned:3}))});
  }catch{res.status(503).json({error:'Inventory unavailable. Open the game to reconnect.'});}
 });
 return {close(){}};
}
