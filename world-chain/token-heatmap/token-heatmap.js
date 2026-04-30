(function(){
'use strict';

var names='WLD ORO WDD ORB WNB XAU MINI HUMN ORBID GASW WUSD BETA EYE PAY APP CHAIN SCAN WBRG FEE DAPP SPOT POOL FLOW VAULT HUB TILE NODE NOVA CRED LENS RING MAP RISK SAFE IDX DATA CORE WAVE SEED DUST'.split(' ');
var risk=['healthy','healthy','thin-liquidity','healthy','thin-liquidity','healthy','new-or-volatile','healthy','thin-liquidity','new-or-volatile','healthy','thin-liquidity','healthy','thin-liquidity','new-or-volatile','healthy','thin-liquidity','healthy','unknown','new-or-volatile','healthy','thin-liquidity','new-or-volatile','healthy','thin-liquidity','healthy','thin-liquidity','new-or-volatile','unknown','healthy','new-or-volatile','healthy','thin-liquidity','healthy','unknown','stale','thin-liquidity','new-or-volatile','thin-liquidity','stale'];
var tokens=names.map(function(s,i){
  var size=40-i;
  var volume=Math.round(12000000*Math.pow(size/40,2.15)+70000);
  var liquidity=Math.round(8000000*Math.pow(size/40,2.55)+18000);
  var change=((i*37)%70)-24+(i%5===0?8:0);
  return { id:'t'+i, symbol:s, name:s+' demo', volume24h:volume, liquidityUsd:liquidity, change24h:change, fdv:volume*3.4, riskState:risk[i], status:risk[i]==='stale'?'stale':'demo' };
});

var modes={
  market:{label:'Market',desc:'Area = 24h volume. Color = 24h price change.',area:function(t){return t.volume24h},rank:'24h volume'},
  liquidity:{label:'Liquidity',desc:'Area = liquidity. Color = liquidity condition.',area:function(t){return t.liquidityUsd},rank:'liquidity'},
  risk:{label:'Risk',desc:'Area = liquidity. Color = risk state. Risk is not a safety score.',area:function(t){return t.liquidityUsd},rank:'liquidity'}
};
var state={mode:'market',nodes:[],selected:'t0',hover:null,scale:1,tx:0,ty:0,moveMode:false,pointers:{},drag:null,pinch:null,raf:0};
var el={};
var PAN_THRESHOLD=6;

function boot(){
  el.v=$('heatmapViewport'); el.c=$('heatmapTiles'); el.o=$('heatmapOverlay');
  el.cx=el.c.getContext('2d'); el.ox=el.o.getContext('2d');
  el.sel=$('selectedDetail'); el.rank=$('miniRanking'); el.desc=$('modeDescription'); el.status=$('statusMode'); el.legend=$('modeLegend');
  document.querySelectorAll('.mode-btn').forEach(function(btn){btn.addEventListener('click',function(){setMode(btn.dataset.mode);});});
  $('resetZoom').addEventListener('click',function(){fit();draw();});
  $('mobileMapToggle').addEventListener('click',toggleMoveMode);
  el.v.addEventListener('wheel',onWheel,{passive:false});
  el.v.addEventListener('dblclick',onDoubleClick);
  el.v.addEventListener('pointerdown',onPointerDown);
  window.addEventListener('pointermove',onPointerMove,{passive:false});
  window.addEventListener('pointerup',onPointerUp);
  window.addEventListener('pointercancel',onPointerUp);
  new ResizeObserver(function(){requestAnimationFrame(layout);}).observe(el.v);
  layout();
}

function $(id){return document.getElementById(id);}
function setMode(mode){ if(!modes[mode]) return; state.mode=mode; document.querySelectorAll('.mode-btn').forEach(function(b){b.classList.toggle('is-active',b.dataset.mode===mode);}); layout(); }
function toggleMoveMode(){ state.moveMode=!state.moveMode; el.v.classList.toggle('is-move-mode',state.moveMode); $('mobileMapToggle').textContent=state.moveMode?'Back to scroll':'Control map'; $('interactionHint').textContent=state.moveMode?'Pan & pinch':'Page scroll · Tap tiles'; }

function layout(){
  var box=el.v.getBoundingClientRect();
  var w=Math.max(320,Math.floor(box.width));
  var h=Math.max(320,Math.floor(box.height));
  setupCanvas(el.c,w,h); setupCanvas(el.o,w,h);
  var mode=modes[state.mode];
  var items=tokens.map(function(t){ return {id:t.id,label:t.symbol,areaValue:mode.area(t),meta:t}; }).filter(function(x){ return Number.isFinite(x.areaValue)&&x.areaValue>0; });
  state.nodes=treemap(items,0,0,w,h).map(function(n,i){n.rank=i+1;return n;});
  if(!state.nodes.some(function(n){return n.id===state.selected;})) state.selected=state.nodes[0]&&state.nodes[0].id;
  fit();
  renderMeta(); renderSelected(); renderRanking(); draw();
}
function setupCanvas(canvas,w,h){ var dpr=Math.max(1,window.devicePixelRatio||1); canvas.width=Math.floor(w*dpr); canvas.height=Math.floor(h*dpr); canvas.style.width=w+'px'; canvas.style.height=h+'px'; canvas.getContext('2d').setTransform(dpr,0,0,dpr,0,0); }
function fit(){ state.scale=1; state.tx=0; state.ty=0; }

function treemap(items,x,y,w,h){ items=items.slice().sort(function(a,b){return b.areaValue-a.areaValue;}); var total=items.reduce(function(s,i){return s+i.areaValue;},0); return split(items,x,y,w,h,total); }
function split(items,x,y,w,h,total){
  if(items.length<2) return items[0]?[Object.assign({},items[0],{x:x,y:y,w:w,h:h})]:[];
  var a=[],b=[],sum=0;
  for(var i=0;i<items.length;i++){ if(sum<total/2||!a.length){a.push(items[i]);sum+=items[i].areaValue;} else {b.push(items[i]);} }
  var rest=Math.max(0,total-sum);
  if(w>=h){ var aw=w*sum/total; return split(a,x,y,aw,h,sum).concat(split(b,x+aw,y,w-aw,h,rest)); }
  var ah=h*sum/total; return split(a,x,y,w,ah,sum).concat(split(b,x,y+ah,w,h-ah,rest));
}

function draw(){ cancelAnimationFrame(state.raf); state.raf=requestAnimationFrame(function(){drawTiles();drawOverlay();}); }
function drawTiles(){
  var c=el.cx,w=el.c.clientWidth,h=el.c.clientHeight;
  c.clearRect(0,0,w,h); c.fillStyle='#f7f7f7'; c.fillRect(0,0,w,h);
  state.nodes.forEach(function(n){ var r=screenRect(n); if(r.w<=1||r.h<=1) return; var pad=Math.min(4,Math.max(1,Math.min(r.w,r.h)*0.04)); c.fillStyle=color(n.meta); c.fillRect(r.x+pad,r.y+pad,Math.max(0,r.w-pad*2),Math.max(0,r.h-pad*2)); c.strokeStyle='rgba(255,255,255,.85)'; c.strokeRect(r.x+pad,r.y+pad,Math.max(0,r.w-pad*2),Math.max(0,r.h-pad*2)); drawLabel(c,n,r,pad); });
}
function drawLabel(c,n,r,pad){
  var area=r.w*r.h, side=Math.min(r.w,r.h), x=r.x+pad+8, y=r.y+pad+18;
  if(side<24||area<1000) return;
  c.save(); c.beginPath(); c.rect(r.x+pad,r.y+pad,Math.max(0,r.w-pad*2),Math.max(0,r.h-pad*2)); c.clip(); c.fillStyle=textColor(color(n.meta));
  c.font='800 13px system-ui,-apple-system,Segoe UI,sans-serif'; c.fillText(n.meta.symbol,x,y,Math.max(20,r.w-18));
  if(side>=48&&area>=3600){ c.font='700 11px system-ui,-apple-system,Segoe UI,sans-serif'; c.fillText(state.mode==='market'?pct(n.meta.change24h):usd(n.areaValue),x,y+16,Math.max(20,r.w-18)); }
  if(side>=78&&area>=7600){ c.font='500 10px system-ui,-apple-system,Segoe UI,sans-serif'; c.fillText(modes[state.mode].rank,x,y+31,Math.max(20,r.w-18)); }
  c.restore();
}
function drawOverlay(){
  var c=el.ox,w=el.o.clientWidth,h=el.o.clientHeight; c.clearRect(0,0,w,h);
  var hover=state.nodes.find(function(n){return n.id===state.hover && n.id!==state.selected;}); if(hover) outline(c,hover,'rgba(0,0,0,.45)',2);
  var selected=state.nodes.find(function(n){return n.id===state.selected;}); if(selected) outline(c,selected,'#111',3);
}
function outline(c,n,color,line){ var r=screenRect(n); c.strokeStyle=color; c.lineWidth=line; c.strokeRect(r.x+3,r.y+3,Math.max(0,r.w-6),Math.max(0,r.h-6)); }
function screenRect(n){ return {x:n.x*state.scale+state.tx,y:n.y*state.scale+state.ty,w:n.w*state.scale,h:n.h*state.scale}; }
function viewportPoint(e){ var b=el.v.getBoundingClientRect(); return {sx:e.clientX-b.left,sy:e.clientY-b.top,x:(e.clientX-b.left-state.tx)/state.scale,y:(e.clientY-b.top-state.ty)/state.scale}; }
function hit(e){ var p=viewportPoint(e); for(var i=state.nodes.length-1;i>=0;i--){ var n=state.nodes[i]; if(p.x>=n.x&&p.x<=n.x+n.w&&p.y>=n.y&&p.y<=n.y+n.h) return n; } return null; }

function onWheel(e){ if(!(e.ctrlKey||e.altKey||e.metaKey)) return; e.preventDefault(); var p=viewportPoint(e); zoomAt(p.sx,p.sy,e.deltaY<0?1.12:0.89); }
function onDoubleClick(e){ e.preventDefault(); var p=viewportPoint(e); zoomAt(p.sx,p.sy,e.shiftKey?0.72:1.45); }
function zoomAt(sx,sy,factor){ var old=state.scale; var next=Math.min(5,Math.max(0.75,old*factor)); var wx=(sx-state.tx)/old, wy=(sy-state.ty)/old; state.scale=next; state.tx=sx-wx*next; state.ty=sy-wy*next; draw(); }

function onPointerDown(e){
  var isTouch=e.pointerType==='touch';
  if(isTouch && !state.moveMode){ state.drag={id:e.pointerId,x:e.clientX,y:e.clientY,tx:state.tx,ty:state.ty,tapOnly:true,moved:false}; return; }
  state.pointers[e.pointerId]={x:e.clientX,y:e.clientY};
  state.drag={id:e.pointerId,x:e.clientX,y:e.clientY,tx:state.tx,ty:state.ty,tapOnly:false,moved:false};
  if(isTouch && state.moveMode && el.v.setPointerCapture) el.v.setPointerCapture(e.pointerId);
  if(Object.keys(state.pointers).length===2) state.pinch=pinchState();
}
function onPointerMove(e){
  if(e.pointerType!=='touch' && !state.drag){ var h=hit(e); var hid=h&&h.id; if(hid!==state.hover){state.hover=hid;drawOverlay();} return; }
  if(state.drag && state.drag.tapOnly){ if(Math.hypot(e.clientX-state.drag.x,e.clientY-state.drag.y)>PAN_THRESHOLD) state.drag.moved=true; return; }
  if(!state.pointers[e.pointerId] || !state.drag) return;
  if(e.pointerType==='touch' && state.moveMode) e.preventDefault();
  state.pointers[e.pointerId]={x:e.clientX,y:e.clientY};
  var keys=Object.keys(state.pointers);
  if(keys.length===2 && state.pinch){ var p=pinchState(); var next=Math.min(5,Math.max(0.75,state.pinch.scale*(p.distance/Math.max(1,state.pinch.distance)))); state.scale=next; state.tx=p.cx-state.pinch.worldX*next; state.ty=p.cy-state.pinch.worldY*next; draw(); return; }
  var dx=e.clientX-state.drag.x, dy=e.clientY-state.drag.y;
  if(Math.hypot(dx,dy)>PAN_THRESHOLD) state.drag.moved=true;
  if(state.drag.moved){ state.tx=state.drag.tx+dx; state.ty=state.drag.ty+dy; draw(); }
}
function onPointerUp(e){
  delete state.pointers[e.pointerId];
  if(Object.keys(state.pointers).length<2) state.pinch=null;
  if(!state.drag) return;
  if(!state.drag.moved){ var n=hit(e); if(n){ state.selected=n.id; renderSelected(); drawOverlay(); } }
  if(Object.keys(state.pointers).length===0) state.drag=null;
}
function pinchState(){ var pts=Object.keys(state.pointers).map(function(k){return state.pointers[k];}); var a=pts[0],b=pts[1],box=el.v.getBoundingClientRect(),cx=(a.x+b.x)/2-box.left,cy=(a.y+b.y)/2-box.top; return {distance:Math.hypot(a.x-b.x,a.y-b.y),cx:cx,cy:cy,scale:state.scale,worldX:(cx-state.tx)/state.scale,worldY:(cy-state.ty)/state.scale}; }

function renderMeta(){ el.desc.textContent=modes[state.mode].desc; el.status.textContent=modes[state.mode].label; el.legend.innerHTML=legend(); }
function renderSelected(){ var n=state.nodes.find(function(x){return x.id===state.selected;})||state.nodes[0]; if(!n) return; var t=n.meta; el.sel.innerHTML='<div><div class="selected-symbol">'+esc(t.symbol)+'</div><div class="selected-name">'+esc(t.name)+'</div></div>'+row('24h change',pct(t.change24h))+row('24h volume',usd(t.volume24h))+row('Liquidity',usd(t.liquidityUsd))+row('FDV / cap',usd(t.fdv))+row('Risk state','<span class="risk-label risk-'+esc(t.riskState)+'">'+esc(t.riskState)+'</span>')+row('Data status',esc(t.status))+'<div class="detail-actions"><a class="btn" href="/world-chain/sell-impact/">Open in Sell Impact</a><a class="btn secondary" href="/world-chain/ecosystem/?q='+encodeURIComponent(t.symbol)+'">Open in Ecosystem</a></div>'; }
function renderRanking(){ var mode=modes[state.mode]; el.rank.innerHTML=tokens.slice().map(function(t){return{t:t,v:mode.area(t)};}).sort(function(a,b){return b.v-a.v;}).slice(0,12).map(function(e,i){return '<div class="ranking-row"><div class="ranking-rank">#'+(i+1)+'</div><div><div class="ranking-symbol">'+esc(e.t.symbol)+'</div><div class="ranking-sub">'+esc(e.t.name)+' · '+esc(e.t.riskState)+'</div></div><div class="ranking-value">'+usd(e.v)+'</div></div>';}).join(''); }
function row(a,b){return '<div class="detail-row"><span>'+a+'</span><strong>'+b+'</strong></div>';}

function color(t){ if(state.mode==='risk') return riskColor(t.riskState); if(state.mode==='liquidity') return t.liquidityUsd>1000000?'#2f7d46':t.liquidityUsd>120000?'#b47a23':'#a94442'; return Math.abs(t.change24h)<0.5?'#b6b6b6':t.change24h>0?'#2f7d46':'#a94442'; }
function riskColor(r){ return r==='healthy'?'#2f7d46':r==='thin-liquidity'?'#b47a23':r==='new-or-volatile'?'#9a6b1f':r==='stale'?'#777':'#999'; }
function legend(){ var list=state.mode==='market'?[['Positive','#2f7d46'],['Flat','#b6b6b6'],['Negative','#a94442']]:state.mode==='liquidity'?[['Strong','#2f7d46'],['Thin','#b47a23'],['Weak','#a94442']]:[['Observed','#2f7d46'],['Caution','#b47a23'],['Unknown/stale','#777']]; return list.map(function(x){return '<span class="legend-item"><span class="legend-dot" style="background:'+x[1]+'"></span>'+x[0]+'</span>';}).join(''); }
function textColor(c){ return c==='#2f7d46'||c==='#a94442'||c==='#9a6b1f'||c==='#777'?'#fff':'#111'; }
function usd(v){ return v>=1e6?'$'+(v/1e6).toFixed(2)+'M':v>=1e3?'$'+(v/1e3).toFixed(1)+'K':'$'+v.toFixed(2); }
function pct(v){ return (v>0?'+':'')+v.toFixed(1)+'%'; }
function esc(v){ return String(v).replace(/[&<>'"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c];}); }

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
