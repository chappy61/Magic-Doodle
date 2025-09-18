
(()=> {
  const canvas = document.getElementById('canvas');
  if (!canvas) { alert('#canvas が見つからないよ'); return; }
  const ctx = canvas.getContext('2d', { desynchronized: true });

  const animateBtn = document.getElementById('animateBtn');
  const clearBtn   = document.getElementById('clearBtn');
  const saveBtn    = document.getElementById('saveBtn');
  const paletteEl  = document.getElementById('palette');
  const sizeEl     = document.getElementById('size');
  const swatchEl   = document.getElementById('swatch');
  const brushLabel = document.getElementById('brushLabel');

  const colors = ['#ffffff','#60a5fa','#34d399','#f472b6','#facc15','#f87171','#a78bfa','#22d3ee','#f97316','#10b981'];
  let brushColor = colors[0];
  let brushSize  = +sizeEl.value;
  let rainbow = false, hue = 0; // 🌈 追加

  let isDrawing  = false;
  let strokes    = []; // {points:[{x,y,t}], color, size, bbox, closed, behavior, vy, cx, cy, r, rainbow, hueStart}
  let current    = null;
  let animating  = false;
  let rafId      = null;
  let timeStart  = 0;

  // ---- サイズを“実ピクセル”に強制合わせ（モバイル安全）
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

  // ---- パレット（色ボタン）
  for(const c of colors){
    const b = document.createElement('button');
    b.className='chip';
    b.innerHTML = `<span class="swatch" style="background:${c}"></span>`;
    b.addEventListener('click', ()=>{
      rainbow = false;
      brushColor=c;
      swatchEl.style.background = c;
      updateBrushLabel();
    });
    paletteEl.appendChild(b);
  }
  // 🌈 レインボーボタン追加
  const rb = document.createElement('button');
  rb.className = 'chip';
  rb.textContent = '🌈 レインボー';
  rb.title = 'レインボーブラシ';
  rb.addEventListener('click', ()=>{
    rainbow = !rainbow;
    rb.classList.toggle('toggle-on', rainbow);
    if (rainbow) {
      swatchEl.style.background = 'linear-gradient(45deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f)';
    } else {
      swatchEl.style.background = brushColor;
    }
    updateBrushLabel();
  });
  paletteEl.appendChild(rb);

  sizeEl.addEventListener('input', ()=>{ brushSize=+sizeEl.value; updateBrushLabel(); });
  function updateBrushLabel(){
    const name = rainbow ? '虹' : nameOfColor(brushColor);
    brushLabel.textContent = `${name} / 太さ ${brushSize}`;
  }
  function nameOfColor(hex){
    const map={"#ffffff":"白","#60a5fa":"空","#34d399":"みどり","#f472b6":"ピンク","#facc15":"きいろ","#f87171":"あか","#a78bfa":"むらさき","#22d3ee":"みず","#f97316":"オレンジ","#10b981":"きみどり"};
    return map[hex]||hex;
  }

  // ---- 座標取得（タッチ/ポインター両対応）
  function getPos(e){
    const rect = canvas.getBoundingClientRect();
    const t = performance.now();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top, t };
    }
    const cx = (e.clientX ?? 0) - rect.left;
    const cy = (e.clientY ?? 0) - rect.top;
    return { x: cx, y: cy, t };
  }

  // ---- 描画
  function startDraw(e){
    e.preventDefault?.();
    isDrawing = true;
    current = {
      points: [],
      color:  brushColor,
      size:   brushSize,
      bbox:   {minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity},
      closed: false,
      behavior:'wiggle',
      vy:0, cx:0, cy:0, r:0,
      rainbow: rainbow,      // 🌈 このストロークは虹？
      hueStart: hue          // 🌈 始点の色相
    };
    strokes.push(current);
    addPoint(e);
  }
  function addPoint(e){
    if(!isDrawing || !current) return;
    // 🌈 モード中は色相を少しずつ進める
    if (rainbow) {
      hue = (hue + 3) % 360;
      brushColor = `hsl(${hue}, 100%, 62%)`;
      if (!current.rainbow) current.rainbow = true; // 途中で虹ONにしても反映
      swatchEl.style.background = 'linear-gradient(45deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f)';
    }
    const p = getPos(e);
    current.points.push(p);
    current.bbox.minX = Math.min(current.bbox.minX, p.x);
    current.bbox.minY = Math.min(current.bbox.minY, p.y);
    current.bbox.maxX = Math.max(current.bbox.maxX, p.x);
    current.bbox.maxY = Math.max(current.bbox.maxY, p.y);
    redraw(0);
  }
  function endDraw(){
    if(!isDrawing || !current) return;
    isDrawing=false;
    const pts=current.points;
    if(pts.length>8){
      const a=pts[0], b=pts[pts.length-1];
      const dist=Math.hypot(a.x-b.x,a.y-b.y);
      const w=current.bbox.maxX-current.bbox.minX;
      const h=current.bbox.maxY-current.bbox.minY;
      const isCircleish = dist < Math.min(w,h)*0.35 && Math.abs(w-h) < Math.max(w,h)*0.35;
      if(isCircleish){
        current.closed=true;
        current.cx = (current.bbox.minX+current.bbox.maxX)/2;
        current.cy = (current.bbox.minY+current.bbox.maxY)/2;
        current.r  = (w+h)/4;
        current.behavior='bounce';
        current.vy=0;
      }
    }
    current=null;
    redraw(0);
  }

  // ---- イベント: Pointer優先、なければTouch+Mouse
  if ('PointerEvent' in window) {
    canvas.addEventListener('pointerdown', (e)=>{ canvas.setPointerCapture?.(e.pointerId); startDraw(e); }, {passive:false});
    canvas.addEventListener('pointermove', (e)=>{ if(isDrawing) addPoint(e); }, {passive:false});
    canvas.addEventListener('pointerup',   endDraw);
    canvas.addEventListener('pointercancel', endDraw);
  } else {
    canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); startDraw(e); }, {passive:false});
    canvas.addEventListener('touchmove',  (e)=>{ e.preventDefault(); addPoint(e); }, {passive:false});
    canvas.addEventListener('touchend',   (e)=>{ e.preventDefault(); endDraw(e); }, {passive:false});
    canvas.addEventListener('mousedown',  startDraw);
    window.addEventListener('mousemove',  addPoint);
    window.addEventListener('mouseup',    endDraw);
  }

  function redraw(t){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const bob = animating ? Math.sin(t*0.002)*2 : 0;
    for(const s of strokes){
      ctx.lineCap='round';
      ctx.lineJoin='round';
      ctx.lineWidth=s.size;
      if(s.behavior==='bounce' && animating){
        s.vy += 0.35;
        s.cy += s.vy;
        const floor = canvas.height/(window.devicePixelRatio||1) - s.r - 4;
        if(s.cy>floor){ s.cy=floor; s.vy*=-0.58; }
        ctx.strokeStyle=s.color;
        ctx.beginPath();
        ctx.arc(s.cx, s.cy + bob, Math.max(4,s.r - 1 + Math.sin((t/140)) ), 0, Math.PI*2);
        ctx.stroke();
      }else{
        const pts = s.points;
        if(pts.length<2) continue;
        const amp = animating ? Math.min(10, s.size*0.6) : 0;
        if (s.rainbow) {
          // 🌈 セグメントごとに色相を回して描画
          for (let i=1;i<pts.length;i++){
            const p0=pts[i-1], p1=pts[i];
            const n0 = Math.sin(((i-1)*0.35) + t*0.008);
            const n1 = Math.sin((i*0.35) + t*0.008);
            const offX0 = n0 * amp * 0.6;
            const offY0 = Math.cos(((i-1)*0.33)+t*0.009) * amp * 0.6 + bob;
            const offX1 = n1 * amp * 0.6;
            const offY1 = Math.cos((i*0.33)+t*0.009) * amp * 0.6 + bob;
            const x0=p0.x+offX0, y0=p0.y+offY0;
            const x1=p1.x+offX1, y1=p1.y+offY1;
            const hh = (s.hueStart + i*3) % 360;
            ctx.strokeStyle = `hsl(${hh}, 100%, 62%)`;
            ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
          }
        } else {
          ctx.strokeStyle=s.color;
          ctx.beginPath();
          for(let i=0;i<pts.length;i++){
            const p=pts[i];
            const n = Math.sin((i*0.35) + t*0.008);
            const offX = n * amp * 0.6;
            const offY = Math.cos((i*0.33)+t*0.009) * amp * 0.6 + bob;
            const x = p.x + offX, y = p.y + offY;
            if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
          }
          ctx.stroke();
        }
      }
    }
  }

  function loop(ts){
    if(!timeStart) timeStart = ts;
    redraw(ts - timeStart);
    rafId = requestAnimationFrame(loop);
  }

  animateBtn.addEventListener('click', ()=>{
    animating = !animating;
    animateBtn.textContent = animating ? '⏸ 止める' : '▶️ 動かす';
    animateBtn.classList.toggle('toggle-on', animating);
    if(animating && !rafId){ rafId = requestAnimationFrame(loop); }
    if(!animating && rafId){ cancelAnimationFrame(rafId); rafId=null; redraw(0); }
  });
  clearBtn.addEventListener('click', ()=>{ strokes.length=0; redraw(0); });
  saveBtn.addEventListener('click', ()=>{
    const wasAnimating = animating; animating=false; redraw(0);
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a'); a.href=url; a.download='magic-doodle.png'; a.click();
    animating = wasAnimating; if(wasAnimating && !rafId){ rafId=requestAnimationFrame(loop); }
  });

  // --- ツール折りたたみ（しまう/出す）
  const collapseBtn = document.getElementById('collapseBtn');
  const expandFab   = document.getElementById('expandFab');
  function rerenderViewport(){ try { sizeToViewport(); } catch(e){} }
  function collapseTools(){
    document.body.classList.add('tools-collapsed');
    collapseBtn?.setAttribute('aria-expanded','false');
    expandFab?.classList.remove('hidden');
    rerenderViewport();
  }
  function expandTools(){
    document.body.classList.remove('tools-collapsed');
    collapseBtn?.setAttribute('aria-expanded','true');
    expandFab?.classList.add('hidden');
    rerenderViewport();
  }
  collapseBtn?.addEventListener('click', collapseTools);
  expandFab?.addEventListener('click', expandTools);

  // start!
  sizeToViewport();
  updateBrushLabel();
})();
