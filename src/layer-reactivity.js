import { GUI } from '../vendor/lil-gui.module.min.js';
const clamp=x=>Math.max(0,Math.min(3.5,x));
const names=['vocals','drums','percussion','bass','guitar','keyboard'];
const automatic={vocals:0.9,drums:0.85,percussion:0.7,bass:0.9,guitar:0.8,keyboard:0.85,articulation:0.8,sustain:0.9,timbre:0.8};
const colors=['#91dfff','#ff9b8f','#f4d785','#9fb0ff','#e7a2ef','#99e5c4'];
export class LayerReactivity {
  constructor(){
    this.master={intensity:1.25,dynamics:0.65};this.mode='automatic';this.settings={...automatic};this.effectiveSettings={...automatic};this.smoothed={};
    this.values={};this.events={};
  }
  attach(host){
    this.detach();
    this.gui=new GUI({container:host,title:'Music Response'});
    const toolbar=document.createElement('div');toolbar.className='response-mode';
    toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Music sensitivity mode');
    toolbar.innerHTML='<button type="button" data-mode="automatic">Automatic</button><button type="button" data-mode="manual">Manual</button>';
    this.gui.domElement.querySelector('.children').prepend(toolbar);
    const modeHelp=document.createElement('p');modeHelp.className='response-mode-help';modeHelp.setAttribute('aria-live','polite');toolbar.after(modeHelp);
    this.gui.add(this.master,'intensity',0,10,0.05).name('Audio Response');
    this.gui.add(this.master,'dynamics',0,1,0.01).name('Reaction Dynamics');
    const manual=this.gui.addFolder('Manual sensitivity');
    manual.open();
    const labels=['Vocal Sensitivity','Drum Sensitivity','Percussion Sensitivity','Bass Sensitivity','Guitar Sensitivity','Keyboard Sensitivity'];
    names.forEach((name,i)=>manual.add(this.settings,name,0,3,0.01).name(labels[i]));
    manual.add(this.settings,'articulation',0,2,0.01).name('Note Articulation');
    manual.add(this.settings,'sustain',0,2,0.01).name('Sustain Response');
    manual.add(this.settings,'timbre',0,2,0.01).name('Timbre Response');
    const meter=document.createElement('div');meter.className='layer-meters';
    meter.innerHTML='<p>Estimated layers from the full mix</p>'+names.map((n,i)=>`<div><span>${n}</span><i style="--line-color:${colors[i]}"><b></b></i></div>`).join('')+'<p class="layer-phrase">Listening</p>';
    this.gui.domElement.appendChild(meter);this.meter=meter;
    this.bars=[...meter.querySelectorAll('b')];
    const syncMode=()=>{
      if(this.mode==='manual')manual.show();else manual.hide();
      meter.hidden=this.mode!=='manual';
      modeHelp.textContent=this.mode==='manual'?'Adjust each musical layer below.':'Automatic response is active. Choose Manual to adjust sensitivities.';
      toolbar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===this.mode)));
    };
    toolbar.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{this.mode=button.dataset.mode;syncMode();}));
    syncMode();
  }
  detach(){this.gui?.destroy();this.gui=null;this.meter=null;}
  route(audio,dt=1/60){
    this.effectiveSettings=this.mode==='manual'?this.settings:automatic;
    const settings=this.effectiveSettings;
    const intensity=this.master.intensity;
    const dynamics=this.master.dynamics;
    const smooth=(key,target)=>{
      const current=this.smoothed[key]||0;
      const rate=target>current?3+21*dynamics:2.5+6*dynamics;
      return this.smoothed[key]=current+(target-current)*(1-Math.exp(-Math.min(0.1,dt)*rate));
    };
    const analysis=audio.musicalLines;
    const lines=analysis?.lines||{};
    for(const name of names){
      const s=lines[name]||{};const gain=settings[name]*intensity;
      this.values[name]=smooth(name,clamp((s.level||0)*gain));
      this.events[name]={attack:smooth(name+'Attack',(s.attack||0)*gain*settings.articulation*(0.35+0.65*dynamics)),
        sustain:smooth(name+'Sustain',(s.sustain||0)*gain*settings.sustain),
        noteChange:smooth(name+'Note',(s.noteChange||0)*gain*settings.articulation*(0.35+0.65*dynamics)),
        staccato:smooth(name+'Short',(s.staccato||0)*gain*settings.articulation*(0.35+0.65*dynamics)),note:s.note||0};
    }
    const v=this.values,e=this.events;
    const proxy=Object.create(audio);
    proxy.low=smooth('low',clamp(audio.low*0.35*intensity+v.bass*0.32+v.drums*0.12));
    proxy.mid=smooth('mid',clamp(audio.mid*0.35*intensity+v.vocals*0.18+v.guitar*0.14+v.keyboard*0.14));
    proxy.high=smooth('high',clamp(audio.high*0.35*intensity+v.percussion*0.26+v.guitar*0.10));
    proxy.beatIntensity=smooth('beat',clamp(audio.beatIntensity*settings.drums*intensity*(0.35+0.35*dynamics)+v.drums*0.20));
    proxy.beat=audio.beat && proxy.beatIntensity>0.05;
    proxy.inputEnergy=audio.energy; // Preserve silence detection for tempo-driven travel.
    proxy.energy=audio.energy*intensity;
    // Spectrum bars and waveform must follow the same master response.
    if(audio.freqData){
      if(this.freq?.length!==audio.freqData.length)this.freq=new Uint8Array(audio.freqData.length);
      for(let i=0;i<this.freq.length;i++)this.freq[i]=Math.min(255,audio.freqData[i]*intensity);
      proxy.freqData=this.freq;
    }
    if(audio.waveData){
      if(this.wave?.length!==audio.waveData.length)this.wave=new Uint8Array(audio.waveData.length);
      for(let i=0;i<this.wave.length;i++)this.wave[i]=Math.max(0,Math.min(255,128+(audio.waveData[i]-128)*intensity));
      proxy.waveData=this.wave;
    }
    proxy.music=Object.create(audio.music);
    proxy.music.harmonyChange=audio.music.harmonyChange*intensity;
    proxy.music.energyChange=audio.music.energyChange*intensity;
    proxy.music.harmonyHue=0.5+(audio.music.harmonyHue-0.5)*Math.min(1,intensity);
    proxy.music.kick=smooth('kick',clamp(audio.music.kick*settings.drums*intensity*(0.45+0.4*dynamics)));
    proxy.music.snare=smooth('snare',clamp(audio.music.snare*settings.drums*intensity*(0.45+0.4*dynamics)));
    proxy.music.hat=smooth('hat',clamp(audio.music.hat*settings.percussion*intensity*(0.4+0.35*dynamics)));
    this.triplet=smooth('triplet',(analysis?.triplet||0)*settings.articulation*intensity*(0.35+0.65*dynamics));
    if(this.meter){
      names.forEach((n,i)=>this.bars[i].style.transform=`scaleX(${Math.min(1,v[n])})`);
      this.meter.querySelector('.layer-phrase').textContent=analysis?.silence>0.85?'Silence':analysis?.triplet>0.3?'Triplet-like rhythm':
        Math.max(...names.map(n=>e[n].staccato))>0.25?'Short / staccato notes':
        Math.max(...names.map(n=>e[n].noteChange))>0.3?'Note change':
        Math.max(...names.map(n=>e[n].sustain))>0.15?'Sustained tones':'Attacks / flowing phrases';
    }
    return proxy;
  }
  apply(screen,id,audio){
    const v=this.values,e=this.events,u=screen.uniforms;
    const note=Math.max(e.vocals.noteChange,e.guitar.noteChange,e.keyboard.noteChange);
    const sustain=e.vocals.sustain+e.keyboard.sustain;
    const sharp=Math.max(e.guitar.staccato,e.keyboard.staccato,e.percussion.attack);
    if(u){
      const add=(key,value)=>{if(u[key])u[key].value+=value;};
      if(id==='tunnel'){
        add('u_warp',v.vocals*0.16+v.guitar*0.13*this.effectiveSettings.timbre);
        add('u_brightness',sustain*0.22+v.percussion*0.15);add('u_mid',note*0.08);
      }else if(id==='kaleidoscope'){
        add('u_warp',v.vocals*0.18+v.guitar*0.16*this.effectiveSettings.timbre);
        add('u_rot',v.keyboard*0.10+note*0.06);add('u_brightness',sustain*0.2+sharp*0.15);
      }else if(id==='mandelbulb'){
        add('u_morph',v.vocals*0.22);add('u_distortion',v.guitar*0.2*this.effectiveSettings.timbre);
        add('u_glow',sustain*0.35+v.percussion*0.2);add('u_hueDrift',note*0.06);
      }else{
        u.u_vocal.value=v.vocals;
        u.u_guitar.value=v.guitar*this.effectiveSettings.timbre;
        u.u_keys.value=v.keyboard;
        u.u_sustain.value=sustain;
        u.u_noteChange.value=note;
        u.u_staccato.value=sharp;
        u.u_triplet.value=this.triplet||0;
      }
    }else if(id==='spectrum'){
      const canvas=document.querySelector('#stage canvas');if(!canvas)return;
      const c=canvas.getContext('2d'),w=window.innerWidth,h=window.innerHeight;
      c.save();
      names.forEach((n,i)=>{
        const level=v[n];if(level<0.005)return;
        const radius=Math.min(w,h)*(0.10+i*0.013+level*0.018);
        c.strokeStyle=colors[i];c.globalAlpha=Math.min(0.85,level*0.65+e[n].attack*0.2);
        c.lineWidth=1.2+e[n].attack*3+e[n].staccato*2;
        c.shadowColor=colors[i];c.shadowBlur=8+e[n].sustain*15;
        c.beginPath();c.arc(w/2,h/2,radius,0,Math.PI*2*(0.4+Math.min(0.6,level+e[n].sustain)));c.stroke();
      });c.restore();
    }
  }
}
