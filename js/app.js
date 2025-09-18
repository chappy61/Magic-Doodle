(()=>{
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const animateBtn = document.getElementById('animateBtn');
  const clearBtn = document.getElementById('clearBtn');
  const saveBtn = document.getElementById('saveBtn');
  const paletteEl = document.getElementById('palette');
  const sizeEl = document.getElementById('size');
  const swatchEl = document.getElementById('swatch');
  const brushLabel = document.getElementById('brushLabel');


  const colors = ['#ffffff','#60a5fa','#34d399','#f472b6','#facc15','#f87171','#a78bfa','#22d3ee','#f97316','#10b981'];
  let brushColor = colors[0];
  let brushSize = +sizeEl.value;
  let isDrawing = false;
  let strokes = []; // {points:[{x,y,t}], color, size, bbox, closed, behavior}
  let current = null;
  let animating = false;
  let rafId = null;
  let timeStart = 0;


  function resize(){
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const {clientWidth:w, clientHeight:h} = canvas;
  const needW = Math.floor(w*dpr), needH = Math.floor(h*dpr);
  if(canvas.width!==needW || canvas.height!==needH){
  const img = ctx.getImageData(0,0,canvas.width,canvas.height);
  canvas.width = needW; canvas.height = needH; ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.putImageData(img,0,0);
  }
  redraw(0);
  }
  function fitCanvasSize(){
  const head = document.querySelector('header');
  const foot = document.querySelector('footer');
  canvas.style.height = `calc(100vh - ${head.offsetHeight + foot.offsetHeight}px)`;
  canvas.style.width = '100vw';
  resize();
  }
  window.addEventListener('resize', fitCanvasSize);
  window.addEventListener('orientationchange', fitCanvasSize);


  // palette
  for(const c of colors){
  const b = document.createElement('button');
  b.className='chip';
  b.innerHTML = `<span class="swatch" style="background:${c}"></span>`;
  b.addEventListener('click', ()=>{brushColor=c; swatchEl.style.background=c; updateBrushLabel();});
  paletteEl.appendChild(b);
  }


  sizeEl.addEventListener('input', ()=>{brushSize=+sizeEl.value; updateBrushLabel();});
  function updateBrushLabel(){ brushLabel.textContent = `${nameOfColor(brushColor)} / 太さ ${brushSize}`; }
  function nameOfColor(hex){
  const map={"#ffffff":"白","#60a5fa":"空","#34d399":"みどり","#f472b6":"ピンク","#facc15":"きいろ","#f87171":"あか","#a78bfa":"むらさき","#22d3ee":"みず","#f97316":"オレンジ","#10b981":"きみどり"};
  return map[hex]||hex;
  }
  function getPos(e){
    const rect = canvas.getBoundingClientRect();
    const t = performance.now();
    if(e.touches && e.touches[0]){
      return {x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top, t};
    } else {

      return { x: e.clientX - rect.left, y: e.clientY - rect.top, t };
    }
  }
})
