(()=> {
  const canvas = document.getElementById('canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { desynchronized: true,alpha: false });

  // ====== UI要素
  const toolbar   = document.getElementById('toolbar');
  const animateBtn= document.getElementById('animateBtn');
  const clearBtn  = document.getElementById('clearBtn');
  const saveBtn   = document.getElementById('saveBtn');
  const paletteEl = document.getElementById('palette');
  const sizeEl    = document.getElementById('size');
  const swatchEl  = document.getElementById('swatch');
  const brushLabel= document.getElementById('brushLabel');
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  // ====== 状態
  const colors = ['#ffffff','#60a5fa','#34d399','#f472b6','#facc15','#f87171','#a78bfa','#22d3ee','#f97316','#10b981'];
  let brushColor = colors[0];
  let brushSize  = +sizeEl.value;
  let rainbow = false, hue = 0;
  
  const behaviors = ['wiggle','bounce','float','rain'];
  let behaviorIdx = 0;
  const behaviorBtn = document.createElement('button');
  behaviorBtn.className = 'chip';
  function labelBehavior(b){ return {wiggle:'ぷるぷる', bounce:'ぽよん', float:'ふわふわ', rain:'あめ'}[b]; }
  function updateBehaviorBtn(){ behaviorBtn.textContent = `🎬 動き: ${labelBehavior(behaviors[behaviorIdx])}`; }
  behaviorBtn.addEventListener('click', ()=>{ behaviorIdx=(behaviorIdx+1)%behaviors.length; updateBehaviorBtn(); });
  updateBehaviorBtn();
  toolbar.appendChild(behaviorBtn);

  // ブラシモード：normal / fuzzy(もこもこ) / dashed(点線) / dotted(ドット)
  const brushModes = ['normal','fuzzy','dashed','dotted'];
  let brushModeIdx = 0;
  const brushMode = () => brushModes[brushModeIdx];

  let isDrawing=false, strokes=[], current=null, animating=false, rafId=null, timeStart=0;

  // ====== サイズ調整（モバイル安全）
  function sizeToViewport(){
    const headH = document.querySelector('header')?.offsetHeight || 0;
    const footH = document.querySelector('footer')?.offsetHeight || 0;
    const cssW  = window.innerWidth;
    const cssH  = Math.max(100, window.innerHeight - headH - footH);
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width  = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    redraw(0);
  }
  window.addEventListener('resize', sizeToViewport);
  window.addEventListener('orientationchange', sizeToViewport);

  // ====== パレット
  for(const c of colors){
    const b = document.createElement('button');
    b.className='chip';
    b.innerHTML = `<span class="swatch" style="background:${c}"></span>`;
    b.addEventListener('click', ()=>{
      rainbow=false; brushColor=c; swatchEl.style.background=c; updateBrushLabel();
    });
    paletteEl.appendChild(b);
  }
  // 🌈 レインボー
  const rb = document.createElement('button');
  rb.className='chip';
  rb.textContent='🌈';
  rb.addEventListener('click', ()=>{
    rainbow=!rainbow; rb.classList.toggle('toggle-on', rainbow);
    swatchEl.style.background = rainbow ? 'linear-gradient(45deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f)' : brushColor;
    updateBrushLabel();
  });
  paletteEl.appendChild(rb);

  // ブラシモード切替（ボタン1つで循環）
  const brushBtn = document.createElement('button');
  brushBtn.className = 'chip';
  function updateBrushBtn(){ brushBtn.textContent = `🖌 ペン: ${({'normal':'ふつう','fuzzy':'もこもこ','dashed':'てんてん','dotted':'ドット'})[brushMode()]}`; }
  brushBtn.addEventListener('click', ()=>{ brushModeIdx=(brushModeIdx+1)%brushModes.length; updateBrushBtn(); });
  updateBrushBtn();
  toolbar.appendChild(brushBtn);

  // 消しゴム
  let erasing = false;
  const eraserBtn = document.createElement('button');
  eraserBtn.id='eraserBtn'; eraserBtn.className='chip'; eraserBtn.textContent='🩹';
  eraserBtn.addEventListener('click', ()=>{ erasing=!erasing; eraserBtn.classList.toggle('toggle-on', erasing); });
  toolbar.appendChild(eraserBtn);

  // スライダー＆ラベル
  sizeEl.addEventListener('input', ()=>{ brushSize=+sizeEl.value; updateBrushLabel(); });
  function updateBrushLabel(){ brushLabel.textContent = `${rainbow ? '🌈' : nameOfColor(brushColor)}`; }
  function nameOfColor(hex){ const map={"#ffffff":"しろ","#60a5fa":"そら","#34d399":"みどり","#f472b6":"ピンク","#facc15":"きいろ","#f87171":"あか","#a78bfa":"むらさき","#22d3ee":"みず","#f97316":"オレンジ","#10b981":"きみどり"}; return map[hex]||hex; }

  // ====== 入力座標
  function getPos(e){
    const r = canvas.getBoundingClientRect();
    const t = performance.now();
    if (e.touches && e.touches[0]) return { x:e.touches[0].clientX-r.left, y:e.touches[0].clientY-r.top, t };
    return { x:(e.clientX??0)-r.left, y:(e.clientY??0)-r.top, t };
  }

  // ====== 描画開始/追加/終了
  function startDraw(e){
    e.preventDefault?.(); isDrawing=true;
    const mode = brushMode();
    const p = getPos(e);
    // 自由描画
    current = {
      type:'free',
      points:[],
      color: brushColor,
      size:  brushSize,
      bbox: {minX:1e9,minY:1e9,maxX:-1e9,maxY:-1e9},
      closed:false, behavior: behaviors[behaviorIdx], 
      vy:0, cx:0, cy:0, r:0,
      rainbow: rainbow,
      hueStart: hue,
      erase: erasing,
      mode: mode,
      seed: Math.random()*1000, speed: 0.8 + Math.random()*0.6
    };
    strokes.push(current);
    addPoint(e);
  }

  function addPoint(e){
    if(!isDrawing||!current) return;

    // レインボーは色相前進
    if (rainbow){ hue=(hue+3)%360; brushColor=`hsl(${hue},100%,62%)`; current.rainbow=true; }

    const p=getPos(e);
    current.points.push(p);
    const b=current.bbox; b.minX=Math.min(b.minX,p.x); b.minY=Math.min(b.minY,p.y); b.maxX=Math.max(b.maxX,p.x); b.maxY=Math.max(b.maxY,p.y);
    redraw(0);
  }

  function endDraw(){
    if(!isDrawing||!current) return; isDrawing=false;

    if (current.type==='free'){
      const pts=current.points; 
      if(pts && pts.length>8){
        const a=pts[0], b=pts[pts.length-1], w=current.bbox.maxX-current.bbox.minX, h=current.bbox.maxY-current.bbox.minY;
        const isCircleish = Math.hypot(a.x-b.x,a.y-b.y) < Math.min(w,h)*0.35 && Math.abs(w-h) < Math.max(w,h)*0.35;
        if(isCircleish){ current.closed=true; current.cx=(current.bbox.minX+current.bbox.maxX)/2; current.cy=(current.bbox.minY+current.bbox.maxY)/2;
          current.r=(w+h)/4; current.behavior='bounce'; current.vy=0;
        } else {
        // 重心（適当でもOK。ここではバウンディングボックス中心）
        current.cx=(current.bbox.minX+current.bbox.maxX)/2;
        current.cy=(current.bbox.minY+current.bbox.maxY)/2;
        } 
      }
    }
    redraw(0);
    current=null;
  }

  // 入力イベント（Pointer優先）
  if ('PointerEvent' in window) {
    canvas.addEventListener('pointerdown', e=>{ canvas.setPointerCapture?.(e.pointerId); startDraw(e); }, {passive:false});
    canvas.addEventListener('pointermove', e=>{ if(isDrawing) addPoint(e); }, {passive:false});
    canvas.addEventListener('pointerup', endDraw);
    canvas.addEventListener('pointercancel', endDraw);
  } else {
    canvas.addEventListener('touchstart', e=>{ e.preventDefault(); startDraw(e); }, {passive:false});
    canvas.addEventListener('touchmove',  e=>{ e.preventDefault(); addPoint(e); }, {passive:false});
    canvas.addEventListener('touchend',   e=>{ e.preventDefault(); endDraw(e); }, {passive:false});
    canvas.addEventListener('mousedown',  startDraw); window.addEventListener('mousemove', addPoint); window.addEventListener('mouseup', endDraw);
  }

  // ====== 折りたたみトグル（しまう/出す + 2本指トグル）
  const collapseBtn = document.getElementById('collapseBtn');
  const expandFab   = document.getElementById('expandFab');
  function setCollapsed(collapsed){
    document.body.classList.toggle('tools-collapsed', collapsed);
    collapseBtn?.setAttribute('aria-expanded', String(!collapsed));
    expandFab?.classList.toggle('hidden', !collapsed);
    sizeToViewport();
  }
  collapseBtn?.addEventListener('click', ()=> setCollapsed(true));
  expandFab?.addEventListener('click',   ()=> setCollapsed(false));
  canvas.addEventListener('touchstart', (e)=>{ if(e.touches.length===2){ e.preventDefault(); setCollapsed(!document.body.classList.contains('tools-collapsed')); } }, {passive:false});

  // ====== 描画ルール
  function setDashForMode(mode, size){
    if (mode==='dashed'){ ctx.setLineDash([size*2, size*1.4]); ctx.lineCap='butt'; }
    else if (mode==='dotted'){ ctx.setLineDash([0, size*1.6]); ctx.lineCap='round'; }
    else { ctx.setLineDash([]); ctx.lineCap='round'; }
  }

  function drawShapePath(s){
    const x0=Math.min(s.sx,s.ex), y0=Math.min(s.sy,s.ey);
    const x1=Math.max(s.sx,s.ex), y1=Math.max(s.sy,s.ey);
    const w=x1-x0, h=y1-y0, cx=(x0+x1)/2, cy=(y0+y1)/2, r=Math.max(4, Math.min(w,h)/2);
    ctx.beginPath();
    if (s.shape==='circle'){
      ctx.arc(cx,cy,r,0,Math.PI*2);
    } else if (s.shape==='rect'){
      ctx.rect(x0,y0,w,h);
    } else if (s.shape==='triangle'){
      // 正三角形（底辺を下に）
      const p1={x:cx, y:y0}, p2={x:x0, y:y1}, p3={x:x1, y:y1};
      ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.lineTo(p3.x,p3.y); ctx.closePath();
    } else if (s.shape==='star'){
      // 5角星
      const spikes=5, outer=r, inner=r*0.5;
      let rot = -Math.PI/2;
      ctx.moveTo(cx + Math.cos(rot)*outer, cy + Math.sin(rot)*outer);
      for(let i=0;i<spikes;i++){
        rot += Math.PI/spikes;
        ctx.lineTo(cx + Math.cos(rot)*inner, cy + Math.sin(rot)*inner);
        rot += Math.PI/spikes;
        ctx.lineTo(cx + Math.cos(rot)*outer, cy + Math.sin(rot)*outer);
      }
      ctx.closePath();
    }
  }

  function drawFreeStroke(s, t){
    const pts = s.points;
    if(pts.length<2) return;
    const amp = animating ? Math.min(10, s.size*0.6) : 0;

    if (s.erase){
      ctx.save(); ctx.globalCompositeOperation='destination-out';
      ctx.lineWidth=s.size; setDashForMode('normal', s.size); // 消しゴムは常に実線
      ctx.beginPath();
      for(let i=0;i<pts.length;i++){
        const p=pts[i], n=Math.sin((i*0.35)+t*0.008);
        const x=p.x+n*amp*0.6, y=p.y+Math.cos((i*0.33)+t*0.009)*amp*0.6;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke(); ctx.restore();
      return;
    }

    // もこもこ
    if (s.mode==='fuzzy'){
      ctx.save();
      ctx.globalAlpha = 0.12;
      for (let i=0;i<pts.length;i+=2){
        const p=pts[i], n=Math.sin((i*0.35)+t*0.008);
        const x=p.x+n*amp*0.6, y=p.y+Math.cos((i*0.33)+t*0.009)*amp*0.6;
        for(let k=0;k<3;k++){
          const rx=(Math.random()-0.5)*s.size*0.9;
          const ry=(Math.random()-0.5)*s.size*0.9;
          const rr=Math.max(2, s.size*0.7 + (Math.random()-0.5)*s.size*0.4);
          ctx.fillStyle = s.rainbow ? `hsl(${(s.hueStart + i*3 + k*8)%360},100%,62%)` : s.color;
          ctx.beginPath(); ctx.arc(x+rx, y+ry, rr/2, 0, Math.PI*2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      // うっすら輪郭
      ctx.lineWidth = Math.max(1, s.size*0.5);
      ctx.strokeStyle = s.rainbow ? `hsl(${(s.hueStart + 120)%360},100%,62%)` : s.color;
      ctx.beginPath();
      for(let i=0;i<pts.length;i++){
        const p=pts[i], n=Math.sin((i*0.35)+t*0.008);
        const x=p.x+n*amp*0.6, y=p.y+Math.cos((i*0.33)+t*0.009)*amp*0.6;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    // 点線/ドット/ふつう
    ctx.lineWidth = s.size;

    if (s.rainbow && !s.erase) {
      // ★虹：iOSでは実線に固定（ダッシュが抜ける問題回避）
      if (isIOS) { ctx.setLineDash([]); ctx.lineCap = 'round'; }
      else { setDashForMode(s.mode, s.size); }
      const STEP = 4; // 色の進む速さ（3〜6で好みに）
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1], p1 = pts[i];
        const n0 = Math.sin(((i - 1) * 0.35) + t * 0.008);
        const n1 = Math.sin((i * 0.35) + t * 0.008);
        const x0 = p0.x + n0 * amp * 0.6;
        const y0 = p0.y + Math.cos(((i - 1) * 0.33) + t * 0.009) * amp * 0.6;
        const x1 = p1.x + n1 * amp * 0.6;
        const y1 = p1.y + Math.cos((i * 0.33) + t * 0.009) * amp * 0.6;

        ctx.strokeStyle = s.rainbow ? `hsl(${(s.hueStart + pts.length)%360},100%,62%)` : s.color;        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.setLineDash([]); // リセット
    } else {
      // 単色描画（これまで通り）
      setDashForMode(s.mode, s.size);
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], n = Math.sin((i * 0.35) + t * 0.008);
        const x = p.x + n * amp * 0.6;
        const y = p.y + Math.cos((i * 0.33) + t * 0.009) * amp * 0.6;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawShapeStroke(s){
    ctx.save();
    if (s.erase) ctx.globalCompositeOperation='destination-out';
    ctx.lineWidth = s.size;
    setDashForMode(s.mode, s.size);
    ctx.strokeStyle = s.color;
    drawShapePath(s);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
  }

  function redraw(t){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const bob = animating ? Math.sin(t*0.002)*2 : 0;
    for(const s of strokes){
      ctx.lineJoin='round';
      if(s.type==='shape'){
        drawShapeStroke(s);
      }else{
        // bounce (ボール判定)は通常線のみ適用
        if(s.behavior==='bounce' && animating && !s.erase){
          s.vy+=0.35; s.cy+=s.vy;
          const floor = canvas.height/(window.devicePixelRatio||1) - s.r - 4;
          if(s.cy>floor){ s.cy=floor; s.vy*=-0.58; }
          ctx.lineWidth=s.size; ctx.strokeStyle=s.color;
          ctx.beginPath(); ctx.arc(s.cx, s.cy + bob, Math.max(4,s.r-1+Math.sin((t/140))), 0, Math.PI*2); ctx.stroke();
          } else if (s.behavior==='float' && animating) {
            // ふわふわ：上下にゆっくり揺らして描く
            ctx.save();
            const dy = Math.sin((t*0.003) + s.seed) * 6;
            ctx.translate(0, dy);
            drawFreeStroke(s, t);
            ctx.restore();
          } else if (s.behavior==='rain' && animating) {
            // あめ：下に落ち続ける（ループ）
            s.drop = (s.drop||0) + s.speed;
            const H = canvas.height/(window.devicePixelRatio||1);
            ctx.save();
            ctx.translate(0, (s.drop % (H + 40)) - 20);
            drawFreeStroke(s, t);
            ctx.restore();
          } else {
          drawFreeStroke(s, t);
        }
      }
    }
  }

  function loop(ts){ if(!timeStart) timeStart=ts; redraw(ts-timeStart); rafId=requestAnimationFrame(loop); }

  // ====== 再生・クリア・保存
  animateBtn.addEventListener('click', ()=>{
    animating=!animating;
    animateBtn.textContent = animating ? '⏸ ' : '▶️ ';
    animateBtn.classList.toggle('toggle-on', animating);
    if(animating && !rafId) rafId=requestAnimationFrame(loop);
    if(!animating && rafId){ cancelAnimationFrame(rafId); rafId=null; redraw(0); }
  });
  clearBtn.addEventListener('click', ()=>{ strokes.length=0; redraw(0); });
  saveBtn.addEventListener('click', ()=>{ const was=animating; animating=false; redraw(0);
    const url=canvas.toDataURL('image/png'); const a=document.createElement('a'); a.href=url; a.download='magic-doodle.png'; a.click();
    animating=was; if(was && !rafId) rafId=requestAnimationFrame(loop);
  });

  // start
  sizeToViewport(); updateBrushLabel();
})();
