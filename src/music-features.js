// Lightweight real-time estimates from a mixed track, not instrument separation.
const clamp = x => Math.max(0, Math.min(1, x));
const approach = (a, b, dt, rate) => a + (b-a)*(1-Math.exp(-dt*rate));

export class MusicFeatures {
  constructor() { this.reset(); }
  reset() {
    this.bpm = 0; this.tempoConfidence = 0; this.beatPhase = 0;
    this.kick = 0; this.snare = 0; this.hat = 0; this.rhythm = 0;
    this.harmonyHue = 0; this.harmonyChange = 0; this.energyChange = 0;
    this.chroma = new Float32Array(12);
    this.previous = [0,0,0]; this.floor = [0,0,0];
    this.lastHit = [-100,-100,-100]; this.hits = [];
    this.lastTime = null; this.slowEnergy = 0;
    this.root = -1; this.candidate = -1; this.candidateTime = 0;
    this.harmonyConfidence = 0;
  }
  update(db, sampleRate, fftSize, now, active = true, rhythmDb = db, rhythmFftSize = fftSize) {
    const elapsed = this.lastTime === null ? 1/60 : Math.max(0, now-this.lastTime);
    if (elapsed < 1/60 && active) return; // Analyze at most 60 times per second.
    this.lastTime = now;
    const dt = Math.min(0.2, elapsed);
    this.kick *= Math.exp(-dt*8); this.snare *= Math.exp(-dt*11);
    this.hat *= Math.exp(-dt*18); this.harmonyChange *= Math.exp(-dt*2.5);
    this.energyChange *= Math.exp(-dt*3);
    if (!active) {
      this.previous.fill(0);
      if (now-this.lastHit[0]>2) this.tempoConfidence *= Math.exp(-dt);
      this.rhythm = Math.max(this.kick,this.snare*0.7,this.hat*0.4);
      return;
    }
    const hz = sampleRate/fftSize;
    const rhythmHz = sampleRate/rhythmFftSize;
    const range = (lo, hi) => {
      let power = 0, count = 0;
      for (let i = Math.max(1,Math.ceil(lo/rhythmHz)); i <= Math.min(rhythmDb.length-1,Math.floor(hi/rhythmHz)); i++) {
        power += Number.isFinite(rhythmDb[i]) ? Math.pow(10,rhythmDb[i]/10) : 0; count++;
      }
      return Math.sqrt(power/Math.max(1,count));
    };
    // Frequency ranges in Hz, rather than equal-sized FFT-bin groups.
    const levels = [range(35,160), range(180,2200), range(4500,12000)];
    const names = ['kick','snare','hat'];
    const refractory = [0.22,0.13,0.075];
    for (let b=0;b<3;b++) {
      const rise = Math.max(0,levels[b]-this.previous[b]);
      const threshold = Math.max(0.00015,this.floor[b]*0.30);
      if (rise>threshold && levels[b]>this.floor[b]*1.20 && now-this.lastHit[b]>refractory[b]) {
        this[names[b]] = clamp(rise/Math.max(0.0006,this.floor[b]*1.5));
        this.lastHit[b] = now;
        // Prefer low-frequency attacks for tempo; use mid attacks without drums.
        if (b===0 || (b===1 && now-this.lastHit[0]>2)) this._tempoHit(now);
      }
      this.floor[b] = approach(this.floor[b], levels[b], dt, 1.5);
      this.previous[b] = levels[b];
    }
    if (this.bpm && this.hits.length) {
      this.beatPhase = ((now-this.hits.at(-1))*this.bpm/60)%1;
      if (now-this.hits.at(-1)>3) this.tempoConfidence *= Math.exp(-dt*0.7);
    }
    this.rhythm = Math.max(this.kick,this.snare*0.7,this.hat*0.4);
    const energy = levels[0]+levels[1]+levels[2];
    const difference = Math.abs(energy-this.slowEnergy)/Math.max(0.003,this.slowEnergy);
    this.energyChange = Math.max(this.energyChange,clamp((difference-0.3)*0.5));
    this.slowEnergy = approach(this.slowEnergy,energy,dt,0.5);
    this._harmony(db,hz,dt);
  }
  _tempoHit(now) {
    if (this.hits.length && now-this.hits.at(-1)<0.24) return;
    if (this.hits.length && now-this.hits.at(-1)>2.5) this.hits=[];
    this.hits.push(now);
    this.hits=this.hits.filter(t=>now-t<10).slice(-18);
    if (this.hits.length<3) return;
    const gaps=this.hits.slice(1).map((t,i)=>t-this.hits[i]);
    const candidates=[];
    // Fit beat periods to several spacings, rather than averaging adjacent BPMs.
    // Multi-beat candidates tolerate missed kicks and timing jitter.
    for(let i=Math.max(1,this.hits.length-6);i<this.hits.length;i++) {
      for(let lag=1;lag<=Math.min(3,i);lag++) {
        const span=this.hits[i]-this.hits[i-lag];
        for(let beats=1;beats<=lag*2;beats++) {
          const period=span/beats;
          if(period>=0.3 && period<=1.0) candidates.push(period);
        }
      }
    }
    if(this.bpm) candidates.push(60/this.bpm);
    let best=null;
    for(const period of candidates) {
      let score=0,total=0,matched=0,single=0,weightedPeriod=0,weightSum=0;
      for(let i=Math.max(0,gaps.length-10);i<gaps.length;i++) {
        const weight=Math.pow(0.62,gaps.length-1-i);
        const beats=Math.round(gaps[i]/period);
        const error=Math.abs(gaps[i]-beats*period);
        total+=weight;
        if(beats<1 || beats>4 || error>Math.max(0.045,period*0.10)) continue;
        const fit=Math.exp(-Math.pow(error/Math.max(0.018,period*0.055),2)*0.5);
        const support=weight/Math.sqrt(beats);
        score+=support*fit;
        matched+=weight;
        if(beats===1) single+=weight;
        weightedPeriod+=gaps[i]/beats*support;
        weightSum+=support;
      }
      // Favor single beats over half/double-time interpretations, gently favor
      // the current tempo only when the evidence is otherwise almost tied.
      const continuity=this.bpm && Math.abs(60/period-this.bpm)<4 ? 0.025 : 0;
      score=score/Math.max(0.001,total)+continuity;
      if(!best || score>best.score) best={score,coverage:matched/total,
        single,period:weightedPeriod/Math.max(0.001,weightSum)};
    }
    if(!best || best.coverage<0.60 || best.single<0.5) return;
    const estimate=60/best.period;
    this.tempoConfidence=clamp(best.coverage*Math.min(1,gaps.length/3)*Math.min(1,best.score));
    if(this.tempoConfidence>0.35) {
      this.bpm=this.bpm && Math.abs(this.bpm-estimate)<8 ? this.bpm*0.25+estimate*0.75 : estimate;
    }
  }
  _harmony(db,hz,dt) {
    const chroma=new Float32Array(12);
    // Local peaks reduce the effect of broadband percussion on pitch classes.
    for(let i=Math.max(2,Math.ceil(80/hz));i<Math.min(db.length-1,Math.floor(2200/hz));i++) {
      if(db[i]<-75 || db[i]<db[i-1] || db[i]<=db[i+1]) continue;
      const midi=69+12*Math.log2(i*hz/440);
      const pc=((Math.round(midi)%12)+12)%12;
      chroma[pc]+=Math.pow(10,db[i]/20);
    }
    const total=chroma.reduce((a,b)=>a+b,0);
    if(total<0.0005) { this.harmonyConfidence=0; return; }
    for(let i=0;i<12;i++) this.chroma[i]=approach(this.chroma[i],chroma[i]/total,dt,3);
    let best=-1,second=-1,root=0;
    for(let r=0;r<12;r++) {
      const score=this.chroma[r]+0.8*this.chroma[(r+7)%12]+
        0.65*Math.max(this.chroma[(r+3)%12],this.chroma[(r+4)%12]);
      if(score>best) {second=best;best=score;root=r;} else second=Math.max(second,score);
    }
    this.harmonyConfidence=clamp((best-second)/Math.max(0.001,best)*3);
    if(this.harmonyConfidence<0.08) return;
    if(root!==this.candidate) {this.candidate=root;this.candidateTime=0;}
    this.candidateTime+=dt;
    if(this.candidateTime>0.35 && root!==this.root) {
      this.root=root;
      // Fifths ordering yields related colors for harmonically related roots.
      this.harmonyHue=((root*7)%12)/12;
      this.harmonyChange=1;
    }
  }
}
