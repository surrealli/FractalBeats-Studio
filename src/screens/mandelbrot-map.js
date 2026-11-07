import spiralScreen from './mandelbrot.js';

const LIMIT = 0.0005; // Keep zoom within single-precision shader accuracy.
export default {
  id: 'mandelbrot-map', name: 'Mandelbrot Map Flight', icon: '🗺️', type: 'webgl',
  tagline: 'Choose your own fractal region on the map, then fly through it with your music.',
  glow: 'rgba(130,210,255,0.20)', accent: 'rgba(130,210,255,0.65)',
  async create(ctx) {
    const flight = await spiralScreen.create({ ...ctx, screenTitle: '🗺️ Mandelbrot Map Flight' });
    const region = { x: -0.5, y: 0, scale: 2.4, ...ctx.persist.region };
    const view = { x: -0.5, y: 0, scale: 2.7, ...ctx.persist.mapView };
    const palette = { mode: 'music', base: '#67bfff', edge: '#d6f4ff', ...ctx.persist.mapPalette };
    let panMode = ctx.persist.mapPanMode ?? false;
    const panel = document.createElement('section');
    panel.className = 'mandelbrot-map';
    panel.setAttribute('aria-label', 'Mandelbrot region selector');
    panel.innerHTML = `
      <div class="map-heading"><strong>Mandelbrot map</strong><button type="button" class="map-toggle" aria-expanded="true">Hide map</button></div>
      <div class="map-body">
        <canvas width="260" height="180" aria-label="Click a location or drag a box to select your fractal region"></canvas>
        <p class="map-help">Click to aim · drag a box to crop · scroll to explore</p>
        <div class="map-actions"><button type="button" data-action="in" aria-label="Zoom map in">+</button><button type="button" data-action="out" aria-label="Zoom map out">−</button><button type="button" data-action="follow">Map to selection</button><button type="button" data-action="reset">Whole set</button></div>
        <label>Crop zoom <input aria-label="Crop zoom" type="range" min="0" max="3.68" step="0.01"></label>
        <output aria-live="polite"></output>
        <div class="map-palette">
          <label>Palette <select aria-label="Color palette"><option value="music">Music colors</option><option value="custom">Custom colors</option></select></label>
          <div class="map-color-row"><label>Spirals <input type="color" aria-label="Spiral color"></label><label>Edges <input type="color" aria-label="Edge color"></label></div>
        </div>
        <button type="button" class="map-scroll" aria-pressed="false">Map Scroll: Off</button>
        <p class="map-tip">Spirals live along the boundary. Solid interiors contain little visible detail.</p>
      </div>`;
    document.body.appendChild(panel);
    const canvas = panel.querySelector('canvas');
    const g = canvas.getContext('2d');
    const cached = document.createElement('canvas');
    cached.width = canvas.width; cached.height = canvas.height;
    const cg = cached.getContext('2d');
    const zoom = panel.querySelector('input');
    const output = panel.querySelector('output');
    let start = null, drag = null, panStart = null;
    let redraw = 0;
    const world = p => ({ x: view.x + (p.x-canvas.width/2)/canvas.height*view.scale,
      y: view.y - (p.y-canvas.height/2)/canvas.height*view.scale });
    const pixel = p => ({ x: canvas.width/2+(p.x-view.x)/view.scale*canvas.height,
      y: canvas.height/2-(p.y-view.y)/view.scale*canvas.height });
    const point = e => {
      const r = canvas.getBoundingClientRect();
      return { x: Math.max(0,Math.min(canvas.width,(e.clientX-r.left)/r.width*canvas.width)),
        y: Math.max(0,Math.min(canvas.height,(e.clientY-r.top)/r.height*canvas.height)) };
    };
    function applyRegion() {
      flight.uniforms.u_center.value.set(region.x,region.y);
      flight.uniforms.u_regionScale.value = region.scale;
      zoom.value = Math.log10(2.4/region.scale);
      output.textContent = `Center ${region.x.toFixed(5)}, ${region.y.toFixed(5)} · ${(2.4/region.scale).toFixed(1)}×`;
      ctx.persist.region = { ...region };
      paintSelection();
    }
    function paintSelection() {
      g.drawImage(cached,0,0);
      const p = pixel(region);
      const h = region.scale/view.scale*canvas.height;
      // Representative crop at unit tunnel depth, before rotation/audio warp.
      const w = h*canvas.width/canvas.height;
      g.strokeStyle = '#b6edff'; g.lineWidth=1.5;
      g.strokeRect(p.x-w/2,p.y-h/2,w,h);
      g.beginPath();g.moveTo(p.x-6,p.y);g.lineTo(p.x+6,p.y);
      g.moveTo(p.x,p.y-6);g.lineTo(p.x,p.y+6);g.stroke();
      if(start && drag && !panMode) {
        g.fillStyle='rgba(110,210,255,0.18)';
        g.fillRect(start.x,start.y,drag.x-start.x,drag.y-start.y);
        g.strokeRect(start.x,start.y,drag.x-start.x,drag.y-start.y);
      }
    }
    function drawMap() {
      const image = cg.createImageData(canvas.width,canvas.height);
      for(let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) {
        const c=world({x,y});let zx=0,zy=0,n=0;
        // Analytic interior tests save most of the overview-map work.
        const q=(c.x-0.25)**2+c.y*c.y;
        const inside=q*(q+c.x-0.25)<0.25*c.y*c.y || (c.x+1)**2+c.y*c.y<0.0625;
        if(inside)n=220;
        else for(;n<220 && zx*zx+zy*zy<256;n++) {
          const next=zx*zx-zy*zy+c.x;zy=2*zx*zy+c.y;zx=next;
        }
        const i=(y*canvas.width+x)*4;
        const t=n===220?0:0.25+0.75*(0.5+0.5*Math.cos((n+1-Math.log2(Math.max(1,Math.log2(Math.hypot(zx,zy)))))*0.24));
        image.data[i]=n===220?4:15+t*65;
        image.data[i+1]=n===220?10:35+t*125;
        image.data[i+2]=n===220?22:70+t*165;
        image.data[i+3]=255;
      }
      cg.putImageData(image,0,0);
      ctx.persist.mapView={...view};
      paintSelection();
    }
    canvas.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;
      e.preventDefault();e.stopPropagation();
      start=point(e);drag=null;panStart={...view};canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!start)return;
      drag=point(e);
      if(panMode) {
        view.x=panStart.x-(drag.x-start.x)/canvas.height*panStart.scale;
        view.y=panStart.y+(drag.y-start.y)/canvas.height*panStart.scale;
        if(!redraw)redraw=requestAnimationFrame(()=>{redraw=0;drawMap();});
      } else paintSelection();
    });
    canvas.addEventListener('pointerup',e=>{
      if(!start)return;
      const end=point(e);
      if(panMode) {
        view.x=panStart.x-(end.x-start.x)/canvas.height*panStart.scale;
        view.y=panStart.y+(end.y-start.y)/canvas.height*panStart.scale;
        start=null;drag=null;drawMap();return;
      }
      if(Math.hypot(end.x-start.x,end.y-start.y)>6) {
        const center=world({x:(start.x+end.x)/2,y:(start.y+end.y)/2});
        region.x=center.x;region.y=center.y;
        region.scale=Math.max(LIMIT,Math.min(2.4,Math.max(Math.abs(end.y-start.y),Math.abs(end.x-start.x)*canvas.height/canvas.width)/canvas.height*view.scale));
      } else Object.assign(region,world(end));
      start=null;drag=null;applyRegion();
    });
    canvas.addEventListener('pointercancel',()=>{start=null;drag=null;paintSelection();});
    canvas.addEventListener('wheel',e=>{
      e.preventDefault();e.stopPropagation();
      const p=point(e),before=world(p);
      view.scale=Math.max(LIMIT,Math.min(4,view.scale*Math.exp(Math.max(-0.5,Math.min(0.5,e.deltaY*0.002)))));
      const after=world(p);view.x+=before.x-after.x;view.y+=before.y-after.y;drawMap();
    },{passive:false});
    zoom.addEventListener('input',()=>{region.scale=Math.max(LIMIT,2.4/10**Number(zoom.value));applyRegion();});
    panel.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>{
      switch(button.dataset.action) {
        case 'in': view.scale=Math.max(LIMIT,view.scale/2);break;
        case 'out': view.scale=Math.min(4,view.scale*2);break;
        case 'follow': view.x=region.x;view.y=region.y;view.scale=Math.max(LIMIT,Math.min(4,region.scale*2.5));break;
        case 'reset': Object.assign(view,{x:-0.5,y:0,scale:2.7});Object.assign(region,{x:-0.5,y:0,scale:2.4});applyRegion();break;
      }
      drawMap();
    }));
    panel.querySelector('.map-toggle').addEventListener('click',e=>{
      const collapsed=panel.classList.toggle('collapsed');
      e.target.textContent=collapsed?'Show map':'Hide map';
      e.target.setAttribute('aria-expanded',String(!collapsed));
    });
    const paletteSelect=panel.querySelector('select');
    const basePicker=panel.querySelector('[aria-label="Spiral color"]');
    const edgePicker=panel.querySelector('[aria-label="Edge color"]');
    paletteSelect.value=palette.mode;basePicker.value=palette.base;edgePicker.value=palette.edge;
    function applyPalette() {
      flight.uniforms.u_customPalette.value=palette.mode==='custom'?1:0;
      flight.uniforms.u_customBase.value.set(palette.base);
      flight.uniforms.u_customEdge.value.set(palette.edge);
      paletteSelect.value=palette.mode;
      ctx.persist.mapPalette={...palette};
    }
    paletteSelect.addEventListener('change',()=>{palette.mode=paletteSelect.value;applyPalette();});
    for(const [picker,key] of [[basePicker,'base'],[edgePicker,'edge']]) {
      picker.addEventListener('input',()=>{palette[key]=picker.value;palette.mode='custom';applyPalette();});
    }
    const scrollButton=panel.querySelector('.map-scroll');
    function syncPanMode() {
      scrollButton.textContent=`Map Scroll: ${panMode?'On':'Off'}`;
      scrollButton.setAttribute('aria-pressed',String(panMode));
      canvas.style.cursor=panMode?'grab':'crosshair';
      panel.querySelector('.map-help').textContent=panMode?'Drag to move the map · scroll to zoom':'Click to aim · drag a box to crop · scroll to explore';
      canvas.setAttribute('aria-label',panMode?'Drag to pan the Mandelbrot map horizontally or vertically':'Click a location or drag a box to select your fractal region');
      ctx.persist.mapPanMode=panMode;
    }
    scrollButton.addEventListener('click',()=>{panMode=!panMode;start=null;drag=null;syncPanMode();paintSelection();});
    syncPanMode();applyPalette();drawMap();applyRegion();
    return {
      ...flight,
      debug:()=>({...flight.debug(),region:{...region},mapView:{...view},palette:{...palette},panMode}),
      dispose(){if(redraw)cancelAnimationFrame(redraw);flight.dispose();panel.remove();},
    };
  },
};
