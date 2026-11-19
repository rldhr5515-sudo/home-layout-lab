
(()=>{
const $=id=>document.getElementById(id),canvas=$('floor'),ctx=canvas.getContext('2d');
let img=null,customImageData='',items=[],selected=-1,selectedSet=new Set(),history=[],historyIndex=-1,camera={x:0,y:0,zoom:1},panMode=false,panDrag=null,pointerPoints=new Map(),pinchStart=null,calibrated=false,pxPerCm=1.5,view={x:40,y:35,w:920,h:630},drag=null,calMode=false,calPoints=[],zoneMode=false,zonePoints=[],zones=[],activeZoneId="",drawingZoneName="";
const STORAGE_KEY='home-layout-lab-v12';
const OLD_STORAGE_KEY='home-layout-lab-v11';
function snapshot(){return JSON.stringify({items,zones,activeZoneId,calibrated,pxPerCm,customImageData})}
function pushHistory(){const snap=snapshot();if(history[historyIndex]===snap)return;history=history.slice(0,historyIndex+1);history.push(snap);if(history.length>60)history.shift();historyIndex=history.length-1;refreshHistoryButtons()}
function restoreHistory(index){if(index<0||index>=history.length)return;historyIndex=index;const s=JSON.parse(history[index]);items=s.items||[];zones=s.zones||[];activeZoneId=s.activeZoneId||'';calibrated=!!s.calibrated;pxPerCm=s.pxPerCm||1.5;customImageData=s.customImageData||'';selected=-1;selectedSet.clear();refreshRooms();if(customImageData)loadImage(customImageData);else if(!img)loadImage('floorplan.jpg');draw();refreshHistoryButtons()}
function refreshHistoryButtons(){const u=$('undo'),r=$('redo');if(u)u.disabled=historyIndex<=0;if(r)r.disabled=historyIndex>=history.length-1}

function persistState(){
 try{
  const state={items,zones,activeZoneId,calibrated,pxPerCm,customImageData};
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  const el=$('saveStatus');if(el)el.textContent='✓ 이 브라우저에 자동 저장 중 · 마지막 저장 '+new Date().toLocaleTimeString('ko-KR');
 }catch(e){const el=$('saveStatus');if(el)el.textContent='자동 저장 공간이 부족해요. 도면 이미지 용량을 줄여 다시 올려 주세요.'}
}
function restoreState(){
 try{
  const raw=localStorage.getItem(STORAGE_KEY)||localStorage.getItem(OLD_STORAGE_KEY);if(!raw)return false;
  const s=JSON.parse(raw);items=Array.isArray(s.items)?s.items.map(it=>({...it,shape:it.shape||'rect',type:it.type||'custom'})):[];
  zones=Array.isArray(s.zones)?s.zones:[];activeZoneId=s.activeZoneId||'';
  calibrated=!!s.calibrated;pxPerCm=Number(s.pxPerCm)||1.5;customImageData=s.customImageData||'';
  if(customImageData)loadImage(customImageData);
  return true;
 }catch(e){return false}
}
function loadImage(src){const im=new Image();im.onload=()=>{img=im;draw()};im.onerror=()=>{$('status').textContent='도면을 불러오지 못했어요. 이미지 파일을 다시 올려 주세요.'};im.src=src}
loadImage('floorplan.jpg');
$('planUpload').onchange=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>{customImageData=ev.target.result;loadImage(customImageData);persistState()};r.readAsDataURL(f)};
$('useSample').onclick=()=>{customImageData='';loadImage('floorplan.jpg');$('planUpload').value='';persistState()};
$('removePlan').onclick=()=>{img=null;zones=[];zonePoints=[];zoneMode=false;items=[];selected=-1;selectedSet.clear();refreshRooms();draw()};
function imageRect(){if(!img)return{x:40,y:35,w:920,h:630};const sc=Math.min(920/img.width,630/img.height);const w=img.width*sc,h=img.height*sc;return{x:(1000-w)/2,y:(700-h)/2,w,h}}
function getScale(){return calibrated?pxPerCm:1.5}
function itemCorners(it,x=it.x,y=it.y){const sc=getScale(),w=(it.rot?it.h:it.w)*sc,h=(it.rot?it.w:it.h)*sc;return[{x:x-w/2,y:y-h/2},{x:x+w/2,y:y-h/2},{x:x+w/2,y:y+h/2},{x:x-w/2,y:y+h/2}]}
function pointInPoly(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];const cross=((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x);if(cross)inside=!inside}return inside}
function orient(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)}
function onSeg(a,b,p){return Math.min(a.x,b.x)-1e-6<=p.x&&p.x<=Math.max(a.x,b.x)+1e-6&&Math.min(a.y,b.y)-1e-6<=p.y&&p.y<=Math.max(a.y,b.y)+1e-6&&Math.abs(orient(a,b,p))<1e-6}
function segmentsCross(a,b,c,d){const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);if(((o1>0&&o2<0)||(o1<0&&o2>0))&&((o3>0&&o4<0)||(o3<0&&o4>0)))return true;return (Math.abs(o1)<1e-6&&onSeg(a,b,c))||(Math.abs(o2)<1e-6&&onSeg(a,b,d))||(Math.abs(o3)<1e-6&&onSeg(c,d,a))||(Math.abs(o4)<1e-6&&onSeg(c,d,b))}
function getZone(id){return zones.find(z=>z.id===id)}
function insideZone(it,x=it.x,y=it.y){const z=getZone(it.zoneId);if(!z)return true;const poly=z.points,c=itemCorners(it,x,y);if(!c.every(p=>pointInPoly(p,poly)))return false;for(let i=0;i<4;i++){const a=c[i],b=c[(i+1)%4];for(let j=0;j<poly.length;j++){const u=poly[j],v=poly[(j+1)%poly.length];if(segmentsCross(a,b,u,v))return false}}return true}
function boxesOverlap(a,b){
 const sa=getScale(), aw=(a.rot?a.h:a.w)*sa, ah=(a.rot?a.w:a.h)*sa, bw=(b.rot?b.h:b.w)*sa, bh=(b.rot?b.w:b.h)*sa;
 const overlapX=Math.min(a.x+aw/2,b.x+bw/2)-Math.max(a.x-aw/2,b.x-bw/2);
 const overlapY=Math.min(a.y+ah/2,b.y+bh/2)-Math.max(a.y-ah/2,b.y-bh/2);
 return overlapX>1 && overlapY>1;
}
function getCollisionSet(){
 const set=new Set(), pairs=[];
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
  if(boxesOverlap(items[i],items[j])){set.add(i);set.add(j);pairs.push([i,j])}
 }
 return {set,pairs};
}
function findFreeCenter(it,preferred){const z=getZone(it.zoneId);if(!z)return preferred;const poly=z.points,xs=poly.map(p=>p.x),ys=poly.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);if(insideZone(it,preferred.x,preferred.y))return preferred;for(let step=0;step<12;step++){const n=12+step*4;for(let iy=0;iy<=n;iy++)for(let ix=0;ix<=n;ix++){const x=minX+(maxX-minX)*ix/n,y=minY+(maxY-minY)*iy/n;if(insideZone(it,x,y))return{x,y}}}return null}
function refreshRooms(){const sel=$('activeRoom');sel.innerHTML='';if(!zones.length){const o=document.createElement('option');o.value='';o.textContent='등록된 방 없음';sel.appendChild(o);activeZoneId='';}else{zones.forEach(z=>{const o=document.createElement('option');o.value=z.id;o.textContent=z.name;sel.appendChild(o)});if(!zones.some(z=>z.id===activeZoneId))activeZoneId=zones[0].id;sel.value=activeZoneId}}
$('activeRoom').onchange=e=>{activeZoneId=e.target.value;draw()};

function drawFurnitureDetails(it,w,h){
 const type=it.type||'custom',pad=Math.max(5,Math.min(w,h)*.08);
 ctx.save();ctx.strokeStyle='rgba(55,49,41,.72)';ctx.fillStyle='rgba(255,255,255,.38)';
 ctx.lineWidth=Math.max(1.5,Math.min(3,Math.min(w,h)*.025));ctx.lineCap='round';ctx.lineJoin='round';
 const rr=(x,y,ww,hh,r=5,fill=true)=>{ctx.beginPath();ctx.roundRect(x,y,Math.max(1,ww),Math.max(1,hh),Math.min(r,Math.max(1,Math.min(ww,hh)/2)));if(fill)ctx.fill();ctx.stroke()};
 const line=(x1,y1,x2,y2)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()};
 if(type==='sofa'){
   rr(-w/2+pad,-h/2+pad,w-pad*2,h-pad*2,Math.min(10,h*.16),false);
   rr(-w/2+pad,-h/2+pad,w-pad*2,Math.max(7,h*.22),5,true);
   rr(-w/2+pad,-h/2+pad,pad*1.45,h-pad*2,5,true);
   rr(w/2-pad*2.45,-h/2+pad,pad*1.45,h-pad*2,5,true);
   const seatW=(w-pad*3.5)/2;rr(-w/2+pad*1.7,-h/2+pad*1.55,seatW,h-pad*2.1,5,true);
   if(w>h*1.7)rr(-w/2+pad*1.7+seatW+pad*.15,-h/2+pad*1.55,seatW,h-pad*2.1,5,true);
 }else if(type==='bed'){
   rr(-w/2+pad,-h/2+pad,w-pad*2,h-pad*2,5,false);
   const pw=(w-pad*3)/2,ph=Math.max(9,h*.22);
   rr(-w/2+pad*1.2,-h/2+pad*1.2,pw,ph,5,true);rr(pad*.3,-h/2+pad*1.2,pw,ph,5,true);
   line(-w/2+pad,h/2-pad*2.2,w/2-pad,h/2-pad*2.2);
 }else if(type==='table'){
   rr(-w/2+pad*1.4,-h/2+pad*1.4,w-pad*2.8,h-pad*2.8,Math.min(9,h*.12),false);
   if(w>h*1.25){line(0,-h/2+pad*1.6,0,h/2-pad*1.6)}else{line(-w/2+pad*1.6,0,w/2-pad*1.6,0)}
 }else if(type==='chair'){
   rr(-w*.34,-h*.30,w*.68,h*.58,Math.min(8,w*.1),false);
   rr(-w*.34,-h*.43,w*.68,h*.18,5,true);
 }else if(type==='wardrobe'){
   line(0,-h/2+pad,0,h/2-pad);ctx.beginPath();ctx.arc(-pad*.7,0,2.2,0,Math.PI*2);ctx.arc(pad*.7,0,2.2,0,Math.PI*2);ctx.stroke();
 }else if(type==='desk'){
   rr(-w/2+pad,-h/2+pad,w-pad*2,h-pad*2,5,false);
   rr(-w*.22,-h*.28,w*.44,h*.22,4,true);line(0,-h*.06,0,h*.22);line(-w*.18,h*.22,w*.18,h*.22);
 }else if(type==='fridge'){
   line(-w/2+pad,0,w/2-pad,0);line(w*.27,-h*.34,w*.27,-h*.08);line(w*.27,h*.12,w*.27,h*.34);
 }else if(type==='tv'){
   line(-w/2+pad,0,w/2-pad,0);line(-w*.18,-h/2+pad,-w*.18,h/2-pad);line(w*.18,-h/2+pad,w*.18,h/2-pad);
   ctx.beginPath();ctx.arc(-w*.08,0,1.8,0,Math.PI*2);ctx.arc(w*.08,0,1.8,0,Math.PI*2);ctx.stroke();
 }
 ctx.restore();
}

function draw(){ctx.clearRect(0,0,1000,700);ctx.fillStyle='#eeece6';ctx.fillRect(0,0,1000,700);ctx.save();ctx.translate(camera.x,camera.y);ctx.scale(camera.zoom,camera.zoom);view=imageRect();if(img){ctx.fillStyle='#fff';ctx.fillRect(view.x,view.y,view.w,view.h);ctx.drawImage(img,view.x,view.y,view.w,view.h);ctx.strokeStyle='#c9c5bc';ctx.lineWidth=1.5;ctx.strokeRect(view.x,view.y,view.w,view.h)}else{ctx.fillStyle='#6c6a63';ctx.font='20px sans-serif';ctx.textAlign='center';ctx.fillText('도면 이미지를 업로드해 주세요',500,340)}
zones.forEach((z,zi)=>{ctx.save();ctx.beginPath();z.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=zi%2?'rgba(72,116,166,.13)':'rgba(54,126,84,.13)';ctx.fill();ctx.strokeStyle=z.id===activeZoneId?'#278052':'#55728d';ctx.lineWidth=z.id===activeZoneId?4:2.5;ctx.setLineDash([9,5]);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#344d3d';ctx.font='bold 14px sans-serif';ctx.textAlign='center';const cx=z.points.reduce((a,p)=>a+p.x,0)/z.points.length,cy=z.points.reduce((a,p)=>a+p.y,0)/z.points.length;ctx.fillText(z.name,cx,cy);ctx.restore()})
if(zoneMode&&zonePoints.length){ctx.save();ctx.beginPath();zonePoints.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='#d18b22';ctx.lineWidth=3;ctx.setLineDash([7,5]);ctx.stroke();ctx.setLineDash([]);zonePoints.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle='#d18b22';ctx.fill()});ctx.restore()}
const sc=getScale(),collisions=getCollisionSet();items.forEach((it,i)=>{const w=(it.rot?it.h:it.w)*sc,h=(it.rot?it.w:it.h)*sc;ctx.save();ctx.translate(it.x,it.y);ctx.fillStyle=collisions.set.has(i)?'rgba(211,66,52,.30)':it.color;ctx.strokeStyle=collisions.set.has(i)?'#c9362b':(selectedSet.has(i)||i===selected?'#2059a5':'#625c52');ctx.lineWidth=collisions.set.has(i)?4:(selectedSet.has(i)||i===selected?4:2.5);ctx.beginPath();if(it.shape==='circle'){ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2)}else if(it.shape==='round'){ctx.roundRect(-w/2,-h/2,w,h,Math.min(24,w/4,h/4))}else{ctx.rect(-w/2,-h/2,w,h)}ctx.fill();ctx.stroke();
drawFurnitureDetails(it,w,h);
ctx.fillStyle='#51483e';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 15px sans-serif';ctx.fillText(it.name.length>15?it.name.slice(0,14)+'…':it.name,0,-7);ctx.font='11px sans-serif';ctx.fillText(it.w+'×'+it.h+'cm',0,13);
if(i===selected){ctx.fillStyle='#ffffff';ctx.strokeStyle='#2059a5';ctx.lineWidth=2;[[-w/2,-h/2],[w/2,-h/2],[-w/2,h/2],[w/2,h/2]].forEach(([hx,hy])=>{ctx.beginPath();ctx.rect(hx-6,hy-6,12,12);ctx.fill();ctx.stroke()})}
ctx.restore()});
if(calMode&&calPoints.length){ctx.fillStyle='#2363a8';calPoints.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill()});if(calPoints.length===2){ctx.strokeStyle='#2363a8';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(calPoints[0].x,calPoints[0].y);ctx.lineTo(calPoints[1].x,calPoints[1].y);ctx.stroke()}}
ctx.restore();update();$('zoomLabel').textContent=Math.round(camera.zoom*100)+'%';$('panMode').textContent='손바닥 이동 '+(panMode?'ON':'OFF');$('panMode').setAttribute('aria-pressed',String(panMode))}
function renderFurnitureList(){
 const box=$('furnitureList');box.innerHTML='';
 if(!items.length){const p=document.createElement('p');p.className='hint';p.textContent='아직 추가한 가구가 없어요.';box.appendChild(p);return}
 items.forEach((it,i)=>{const b=document.createElement('button');b.type='button';b.className='furniture-row'+((i===selected||selectedSet.has(i))?' active':'');
 const sw=document.createElement('span');sw.className='swatch';sw.style.background=it.color||'#d7c4ad';
 const txt=document.createElement('span');txt.style.flex='1';txt.textContent=it.name;
 const meta=document.createElement('small');meta.textContent=it.w+' × '+it.h+'cm · '+Number(it.price||0).toLocaleString('ko-KR')+'원';txt.appendChild(meta);
 b.append(sw,txt);b.onclick=()=>{selected=i;selectedSet=new Set([i]);draw()};box.appendChild(b)
 })
}
function update(){$('selectedInfo').textContent=selected<0?'도면에서 가구를 선택해 주세요.':(selectedSet.size>1?selectedSet.size+'개 가구 선택됨':items[selected].name+' 선택됨');if(selected>=0){const it=items[selected];$('editW').value=it.w;$('editH').value=it.h;$('editName').value=it.name;$('editPrice').value=it.price;$('editColor').value=it.color||'#d7c4ad';$('editShape').value=it.shape||'rect';$('editType').value=it.type||'custom'}const collisionInfo=getCollisionSet();
$('summary').textContent='배치된 가구 '+items.length+'개'+(collisionInfo.pairs.length?' · 겹침 '+collisionInfo.pairs.length+'곳':' · 가구 겹침 없음');
$('collisionStatus').textContent=collisionInfo.pairs.length?'⚠ 가구가 서로 겹쳐 있어요. 빨간색 테두리로 표시된 가구를 옮겨 주세요. 겹친 가구 쌍: '+collisionInfo.pairs.map(([a,b])=>items[a].name+' ↔ '+items[b].name).join(', '):'';
$('total').textContent=items.reduce((a,b)=>a+b.price,0).toLocaleString('ko-KR')+'원';renderFurnitureList();$('calStatus').textContent=calibrated?'크기 보정 완료':'미설정';$('zoneStatus').textContent=zoneMode?`${drawingZoneName} 영역 · 꼭짓점 ${zonePoints.length}개를 찍고 '영역 확정'을 누르세요.`:zones.length?`등록된 방 ${zones.length}개 · ${zones.map(z=>z.name).join(' / ')}. 선택한 방 안에서 가구를 배치할 수 있어요.`:'아직 방 영역을 지정하지 않았어요. 방을 등록한 뒤 가구를 추가해 주세요.';$('zoneStatus').classList.toggle('zone-active',zoneMode);persistState()}
function screenPos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*1000/r.width,y:(e.clientY-r.top)*700/r.height}}
function pos(e){const q=screenPos(e);return{x:(q.x-camera.x)/camera.zoom,y:(q.y-camera.y)/camera.zoom}}
function zoomAt(next,screen){const z=Math.max(.5,Math.min(3.5,next)),anchor=screen||{x:500,y:350},world={x:(anchor.x-camera.x)/camera.zoom,y:(anchor.y-camera.y)/camera.zoom};camera.zoom=z;camera.x=anchor.x-world.x*z;camera.y=anchor.y-world.y*z;draw()}
$('zoomIn').onclick=()=>zoomAt(camera.zoom*1.2);
$('zoomOut').onclick=()=>zoomAt(camera.zoom/1.2);
$('zoomReset').onclick=()=>{camera={x:0,y:0,zoom:1};draw()};
$('panMode').onclick=()=>{panMode=!panMode;draw()};
// v13: 휠/트랙패드 스크롤로 도면이 의도치 않게 확대되지 않도록 자동 휠 줌 비활성화.
canvas.addEventListener('wheel',e=>{ /* 페이지 스크롤은 브라우저 기본 동작에 맡김 */ },{passive:true});
$('calibrate').onclick=()=>{if(!img){alert('먼저 도면 이미지를 올려 주세요.');return}const n=+$('knownLength').value;if(n<=0){alert('실제 길이를 cm로 입력해 주세요.');return}zoneMode=false;calMode=true;calPoints=[];$('status').textContent='도면에서 기준 길이의 시작점과 끝점을 차례로 클릭하세요.';draw()};
$('resetCal').onclick=()=>{calibrated=false;calMode=false;calPoints=[];draw();$('status').textContent='크기 보정을 초기화했어요.'};
$('drawZone').onclick=()=>{if(!img){alert('먼저 도면 이미지를 올려 주세요.');return}drawingZoneName=$('roomName').value.trim()||'새 방';calMode=false;calPoints=[];zoneMode=true;zonePoints=[];selected=-1;$('status').textContent=drawingZoneName+'의 벽 안쪽을 따라 꼭짓점을 차례로 클릭하세요.';draw()};
$('finishZone').onclick=()=>{pushHistory();if(zonePoints.length<3){alert('영역을 확정하려면 꼭짓점을 3개 이상 찍어 주세요.');return}const id='room-'+Date.now();const z={id,name:drawingZoneName,points:zonePoints.map(p=>({...p}))};zones.push(z);activeZoneId=id;zoneMode=false;refreshRooms();let moved=0;items.forEach(it=>{if(!it.zoneId){it.zoneId=id;if(!insideZone(it)){const c=findFreeCenter(it,{x:z.points.reduce((a,p)=>a+p.x,0)/z.points.length,y:z.points.reduce((a,p)=>a+p.y,0)/z.points.length});if(c){it.x=c.x;it.y=c.y;moved++}}}});$('status').textContent=drawingZoneName+' 영역을 등록했어요.'+(moved?' 기존 가구 '+moved+'개를 해당 영역 안으로 옮겼어요.':'');draw()};
$('clearZone').onclick=()=>{pushHistory();const z=getZone(activeZoneId);if(!z){alert('먼저 지울 방을 선택해 주세요.');return}if(!confirm(z.name+' 영역을 지울까요? 이 방에 연결된 가구는 이동 제한이 해제돼요.'))return;items.forEach(it=>{if(it.zoneId===z.id)it.zoneId=''});zones=zones.filter(x=>x.id!==z.id);activeZoneId=zones[0]?.id||'';refreshRooms();$('status').textContent='선택한 방 영역을 지웠어요.';draw()};
canvas.onpointerdown=e=>{pointerPoints.set(e.pointerId,screenPos(e));canvas.setPointerCapture(e.pointerId);
if(pointerPoints.size===2){if(panMode){const pts=[...pointerPoints.values()],dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);pinchStart={dist,zoom:camera.zoom,mid:{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}};}drag=null;return}
const p=pos(e);if(panMode){panDrag={start:screenPos(e),camera:{...camera}};drag=null;return}
if(zoneMode){zonePoints.push(p);$('status').textContent=`꼭짓점 ${zonePoints.length}개를 찍었어요. 방의 경계를 따라 계속 찍고 '영역 확정'을 누르세요.`;draw();return}if(calMode){calPoints.push(p);if(calPoints.length===2){const dx=calPoints[1].x-calPoints[0].x,dy=calPoints[1].y-calPoints[0].y,d=Math.hypot(dx,dy),cm=+$('knownLength').value;if(d<5){calPoints=[];$('status').textContent='두 점이 너무 가까워요. 다시 찍어 주세요.'}else{pxPerCm=d/cm;calibrated=true;calMode=false;$('status').textContent='크기 보정 완료! 이제 가구가 입력한 cm 크기에 맞춰 표시돼요.'}}else $('status').textContent='좋아요. 이제 기준 길이의 끝점을 클릭하세요.';draw();return}
const sc=getScale();
if(selected>=0 && selectedSet.size===1){const it=items[selected],w=(it.rot?it.h:it.w)*sc,h=(it.rot?it.w:it.h)*sc;
 const corners=[{x:it.x-w/2,y:it.y-h/2,sx:-1,sy:-1},{x:it.x+w/2,y:it.y-h/2,sx:1,sy:-1},{x:it.x-w/2,y:it.y+h/2,sx:-1,sy:1},{x:it.x+w/2,y:it.y+h/2,sx:1,sy:1}];
 const handle=corners.find(c=>Math.hypot(p.x-c.x,p.y-c.y)<=13);
 if(handle){pushHistory();const anchor={x:it.x-handle.sx*w/2,y:it.y-handle.sy*h/2};drag={mode:'resize',anchor,sx:handle.sx,sy:handle.sy,original:{...it}};canvas.setPointerCapture(e.pointerId);return}
}
let hit=-1;for(let i=items.length-1;i>=0;i--){const it=items[i],w=(it.rot?it.h:it.w)*sc,h=(it.rot?it.w:it.h)*sc;if(p.x>=it.x-w/2&&p.x<=it.x+w/2&&p.y>=it.y-h/2&&p.y<=it.y+h/2){hit=i;break}}
if(hit<0){selected=-1;selectedSet.clear();drag=null;draw();return}
if(e.shiftKey){if(selectedSet.has(hit))selectedSet.delete(hit);else selectedSet.add(hit);selected=hit;if(!selectedSet.size)selected=-1;draw();return}
if(!selectedSet.has(hit)){selected=hit;selectedSet=new Set([hit])}else selected=hit;
pushHistory();
const moving=[...selectedSet].filter(i=>i>=0&&i<items.length);
drag={mode:'groupmove',indices:moving,starts:moving.map(i=>({x:items[i].x,y:items[i].y})),start:{x:p.x,y:p.y}};
canvas.setPointerCapture(e.pointerId);draw()};
canvas.onpointermove=e=>{if(pointerPoints.has(e.pointerId))pointerPoints.set(e.pointerId,screenPos(e));
if(pinchStart&&panMode&&pointerPoints.size>=2){const pts=[...pointerPoints.values()],dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),mid={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};const ratio=dist/pinchStart.dist;zoomAt(pinchStart.zoom*ratio,mid);return}
if(panDrag){const q=screenPos(e);camera.x=panDrag.camera.x+q.x-panDrag.start.x;camera.y=panDrag.camera.y+q.y-panDrag.start.y;draw();return}
if(!drag||selected<0)return;const p=pos(e),it=items[selected];
if(drag.mode==='groupmove'){
 const dx=p.x-drag.start.x,dy=p.y-drag.start.y;
 const candidates=drag.indices.map((idx,k)=>({...items[idx],x:drag.starts[k].x+dx,y:drag.starts[k].y+dy}));
 if(candidates.every(c=>insideZone(c))){candidates.forEach((c,k)=>{items[drag.indices[k]].x=c.x;items[drag.indices[k]].y=c.y});$('status').textContent=drag.indices.length>1?'선택한 가구를 함께 이동하고 있어요.':'가구를 이동하고 있어요.'}
 else $('status').textContent='선택한 가구 중 일부가 방 영역 밖으로 나가요.';
}else if(drag.mode==='resize'){
 const sc=getScale(),a=drag.anchor,dx=(p.x-a.x)*drag.sx,dy=(p.y-a.y)*drag.sy;
 const nw=Math.max(10,Math.round(dx/sc)),nh=Math.max(10,Math.round(dy/sc));
 const candidate={...it,w:it.rot?nh:nw,h:it.rot?nw:nh,x:(a.x+p.x)/2,y:(a.y+p.y)/2};
 if(insideZone(candidate)){Object.assign(it,candidate);$('status').textContent='가구 크기를 조절하고 있어요.'}
 else $('status').textContent='방 영역 밖으로는 크기를 늘릴 수 없어요.';
}else{
 const nx=p.x-drag.dx,ny=p.y-drag.dy;
 if(insideZone(it,nx,ny)){it.x=nx;it.y=ny;$('status').textContent='가구를 이동했어요.'}
 else $('status').textContent='배치 영역 밖으로 나갈 수 없어요. 방 안쪽으로 옮겨 주세요.'
}
draw()};
canvas.onpointerup=canvas.onpointercancel=e=>{pointerPoints.delete(e.pointerId);if(pointerPoints.size<2)pinchStart=null;if(pointerPoints.size===0)panDrag=null;if(panDrag){panDrag=null;return}if(drag&&drag.mode==='resize'&&selected>=0){const it=items[selected];$('editW').value=it.w;$('editH').value=it.h;draw()}if(drag)persistState();drag=null};
$('add').onclick=()=>{pushHistory();const w=+$('newW').value,h=+$('newH').value,price=+$('newPrice').value,name=$('newName').value.trim()||'새 가구';if(zones.length&&!getZone(activeZoneId)){alert('먼저 가구를 배치할 방을 선택해 주세요.');return}if(w<10||h<10||w>1500||h>1500||price<0){alert('가구 크기와 가격을 확인해 주세요.');return}const it={name,w,h,price,x:view.x+view.w/2,y:view.y+view.h/2,rot:false,zoneId:activeZoneId,color:$('newColor').value||'#d7c4ad',shape:$('newShape').value||'rect',type:$('newType').value||'custom'};const az=getZone(activeZoneId);const spot=findFreeCenter(it,{x:az?az.points.reduce((a,p)=>a+p.x,0)/az.points.length:view.x+view.w/2,y:az?az.points.reduce((a,p)=>a+p.y,0)/az.points.length:view.y+view.h/2});if(!spot){alert('이 크기의 가구가 들어갈 자리를 배치 영역 안에서 찾지 못했어요. 영역을 넓히거나 가구 크기를 줄여 주세요.');return}it.x=spot.x;it.y=spot.y;items.push(it);selected=items.length-1;selectedSet=new Set([selected]);draw();if(!calibrated)$('status').textContent='가구를 임시 크기로 표시했어요. 실제 크기를 맞추려면 먼저 도면 크기 보정을 해 주세요.'};
$('apply').onclick=()=>{pushHistory();if(selected<0){alert('먼저 가구를 선택해 주세요.');return}const it=items[selected],old={...it},w=+$('editW').value,h=+$('editH').value,p=+$('editPrice').value;if(w<10||h<10||w>1500||h>1500||p<0){alert('가구 크기와 가격을 확인해 주세요.');return}Object.assign(it,{w,h,price:p,name:$('editName').value.trim()||'새 가구',color:$('editColor').value||'#d7c4ad',shape:$('editShape').value||'rect',type:$('editType').value||'custom'});if(!insideZone(it)){Object.assign(it,old);alert('수정한 크기가 배치 영역을 벗어나요. 가구 크기를 줄이거나 영역을 넓혀 주세요.')}draw()};
$('rotate').onclick=()=>{pushHistory();if(selected>=0){const it=items[selected],old=it.rot;it.rot=!it.rot;if(!insideZone(it)){it.rot=old;alert('회전하면 배치 영역을 벗어나요. 가구 위치를 옮긴 뒤 다시 회전해 주세요.')}draw()}};
$('duplicate').onclick=()=>{pushHistory();if(selected>=0){const src=items[selected],it={...src,x:src.x+22,y:src.y+22};const spot=findFreeCenter(it,{x:it.x,y:it.y});if(!spot){alert('복제한 가구를 놓을 공간이 없어요. 방 안쪽에 여유 공간을 만들어 주세요.');return}it.x=spot.x;it.y=spot.y;items.push(it);selected=items.length-1;draw()}};
$('delete').onclick=()=>{pushHistory();if(selected>=0){items.splice(selected,1);selected=-1;draw()}};$('clear').onclick=()=>{pushHistory();if(confirm('배치한 가구를 모두 지울까요?')){items=[];selected=-1;draw()}};
$('saveData').onclick=()=>{persistState();$('saveStatus').textContent='✓ 배치 내용을 이 브라우저에 저장했어요.'};$('resetData').onclick=()=>{if(restoreState()){refreshRooms();selected=-1;draw();$('saveStatus').textContent='저장된 배치를 불러왔어요.'}else alert('저장된 배치가 없어요.')};
$('save').onclick=()=>{draw();const a=document.createElement('a');a.download='우리집-가구배치.png';a.href=canvas.toDataURL('image/png');a.click()};
$('share').onclick=async()=>{draw();canvas.toBlob(async blob=>{if(!blob){alert('이미지를 만들지 못했어요. 다시 시도해 주세요.');return}const file=new File([blob],'우리집-가구배치.png',{type:'image/png'});try{if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title:'우리집 가구 배치도',text:'우리집 배치연구소에서 만든 가구 배치도예요.',files:[file]})}else{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='우리집-가구배치.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);alert('이 브라우저는 이미지 바로 공유를 지원하지 않아 PNG 파일로 저장했어요. 저장한 이미지를 공유해 주세요.')}}catch(err){if(err.name!=='AbortError')alert('공유를 완료하지 못했어요. 이미지 저장 버튼을 이용해 주세요.')}},'image/png')};
$('undo').onclick=()=>restoreHistory(historyIndex-1);
$('redo').onclick=()=>restoreHistory(historyIndex+1);
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();restoreHistory(historyIndex+(e.shiftKey?1:-1))}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();restoreHistory(historyIndex+1)}});
restoreState();pushHistory();refreshRooms();draw();
})();
