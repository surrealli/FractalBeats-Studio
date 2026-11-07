// Mixed-track timbre estimates, not isolated stems or instrument recognition.
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=(a,b,dt,rate)=>a+(b-a)*(1-Math.exp(-dt*rate));
const line=()=>({level:0,attack:0,sustain:0,staccato:0,noteChange:0,note:0,duration:0,held:false});
export class MusicalLines {
  constructor(){this.reset();}
  reset(){
    this.lines=Object.fromEntries(['vocals','drums','percussion','bass','guitar','keyboard'].map(n=>[n,line()]));
    this.lastTime=null;this.previous=new Float32Array(0);this.silence=1;
    this.pitch=0;this.pitchCandidate=0;this.pitchAge=0;this.triplet=0;
    this.rhythmHits=[];this.lastRhythmHit=-10;
  }
  update(db,rate,size,now,active,music){
    const dt=this.lastTime===null?1/60:Math.min(0.25,Math.max(0,now-this.lastTime));
    if(dt<0.012)return;
    this.lastTime=now;
    const hz=rate/size;
    if(this.previous.length!==db.length)this.previous=new Float32Array(db.length);
    let total=0,centroid=0,logs=0,count=0,flux=0;
    const amplitudes=new Float32Array(db.length);
    for(let i=Math.ceil(50/hz);i<Math.min(db.length,Math.ceil(9000/hz));i++){
      const a=active&&Number.isFinite(db[i])?Math.pow(10,db[i]/20):0;
      amplitudes[i]=a;
      total+=a*a;centroid+=a*a*i*hz;logs+=Math.log(Math.max(1e-12,a*a));count++;
      flux+=Math.max(0,a-this.previous[i]);
    }
    this.previous.set(amplitudes);
    const rms=Math.sqrt(total/Math.max(1,count));
    const audible=active&&rms>0.000035;
    const flatness=audible?Math.exp(logs/Math.max(1,count))/(total/Math.max(1,count)):1;
    const tonal=clamp(1-flatness*3);
    const brightness=total?clamp(centroid/total/5000):0;
    const band=(lo,hi)=>{
      let p=0,n=0;for(let i=Math.ceil(lo/hz);i<Math.min(db.length,Math.ceil(hi/hz));i++){p+=amplitudes[i]**2;n++;}
      return clamp(Math.sqrt(Math.sqrt(p/Math.max(1,n)))*5);
    };
    const low=band(50,250),body=band(180,3200),upper=band(700,6000);
    const onset=clamp(flux*5);
    // Harmonic-template pitch: suppress octave errors by rewarding the fundamental.
    let best=0,note=0;
    if(audible&&tonal>0.2){
      for(let midi=40;midi<=84;midi++){
        const f=440*Math.pow(2,(midi-69)/12);let score=0;
        for(let harmonic=1;harmonic<=6;harmonic++){
          const bin=Math.round(f*harmonic/hz);if(bin>=db.length-1)break;
          score+=Math.max(amplitudes[bin-1]||0,amplitudes[bin]||0,amplitudes[bin+1]||0)/(harmonic===1?1:Math.pow(harmonic,1.2));
        }
        if(score>best){best=score;note=midi;}
      }
    }
    if(note!==this.pitchCandidate){this.pitchCandidate=note;this.pitchAge=0;}
    this.pitchAge+=dt;
    if(this.pitchAge>0.04)this.pitch=note;
    const drums=active?(music.kick||0):0, snare=active?(music.snare||0):0,hat=active?(music.hat||0):0;
    const transient=Math.max(drums,snare,hat);
    const targets={
      vocals:audible?body*tonal*(1-0.45*transient):0,
      bass:audible?low*tonal:0,
      guitar:audible?upper*tonal*(0.25+0.75*onset)*(0.6+0.4*brightness):0,
      keyboard:audible?body*tonal*(1-0.5*onset)*(0.55+0.45*brightness):0,
      drums:Math.max(drums,snare*0.8),percussion:Math.max(hat,snare*0.45),
    };
    for(const [name,state] of Object.entries(this.lines)){
      const target=targets[name];const held=target>0.07;
      state.attack*=Math.exp(-dt*13);state.staccato*=Math.exp(-dt*10);state.noteChange*=Math.exp(-dt*7);
      if(held&&!state.held){state.attack=clamp(target*1.6+onset);state.duration=0;}
      if(held){
        state.duration+=dt;
        if(!['drums','percussion'].includes(name)&&this.pitch&&state.note!==this.pitch){
          if(state.note)state.noteChange=1;
          state.note=this.pitch;
        }
      }else{
        if(state.held&&state.duration>0.025&&state.duration<0.25)state.staccato=1;
        state.duration=0;
      }
      state.sustain=ease(state.sustain,held?clamp((state.duration-0.12)*2)*target:0,dt,held?5:10);
      state.level=ease(state.level,target,dt,target>state.level?18:8);
      state.held=held;
    }
    this.silence=ease(this.silence,audible?0:1,dt,12);
    // Triplets require several attacks at one-third-beat spacing, not just tempo.
    if(active&&transient>0.55&&now-this.lastRhythmHit>0.07){
      this.rhythmHits.push(now);this.rhythmHits=this.rhythmHits.filter(t=>now-t<2).slice(-12);this.lastRhythmHit=now;
      if(music.bpm&&music.tempoConfidence>0.35&&this.rhythmHits.length>=4){
        const third=60/music.bpm/3;
        const gaps=this.rhythmHits.slice(-4).slice(1).map((t,i)=>t-this.rhythmHits.slice(-4)[i]);
        if(gaps.every(g=>Math.abs(g-third)<Math.min(0.04,third*0.18)))this.triplet=1;
      }
    }
    this.triplet*=Math.exp(-dt*4);
  }
}
