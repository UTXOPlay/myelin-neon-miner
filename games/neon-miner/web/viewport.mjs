// One isotropic, presentation-only transform for the miner's fixed 1000 × 700 world.
export const MINE_WIDTH=1000, MINE_HEIGHT=700;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function mineViewport(width,height,insets={}) {
  const ui=clamp(height/1080,1,2),wide=width>=600&&width>height;
  const edge=(height<=540?10:20)*ui;
  const left=Math.max(edge,insets.left||0),right=Math.max(edge,insets.right||0);
  const top=Math.max(edge,insets.top||0),bottom=Math.max(edge,insets.bottom||0);
  const rail=(height<=540?132:clamp(width*.115,156,220))*ui;
  const gap=(height<=540?10:20)*ui;
  // Side controls preserve the full height on landscape devices. Portrait desktop
  // windows retain a top HUD and a bottom dock; phones use the rotation gate.
  const area=wide
    ? {x:left+rail+gap,y:top,width:Math.max(1,width-left-right-2*(rail+gap)),height:Math.max(1,height-top-bottom)}
    : {x:left,y:top+184,width:Math.max(1,width-left-right),height:Math.max(1,height-top-bottom-184-96)};
  const scale=Math.min(area.width/MINE_WIDTH,area.height/MINE_HEIGHT);
  const x=area.x+(area.width-MINE_WIDTH*scale)/2,y=area.y+(area.height-MINE_HEIGHT*scale)/2;
  return {width,height,ui,wide,rail,top,bottom,scale,x,y,logicalWidth:MINE_WIDTH,logicalHeight:MINE_HEIGHT,
    left:wide?Math.max(left,x-gap-rail):left,right:wide?Math.max(right,width-x-MINE_WIDTH*scale-gap-rail):right};
}
export function pointerInMine(clientX,clientY,rect,view=mineViewport(rect.width,rect.height)) {
  return {x:(clientX-rect.left-view.x)/view.scale,y:(clientY-rect.top-view.y)/view.scale};
}
export function backingRatio(width,height,ratio) {
  return Math.min(ratio,Math.sqrt(8294400/Math.max(1,width*height)));
}
