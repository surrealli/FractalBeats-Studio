import assert from 'node:assert/strict';
import { MusicFeatures } from '../src/music-features.js';
const rate=44100,size=8192,hz=rate/size;
const frame=(root=0,kick=false,snare=false,hat=false)=>{
 const db=new Float32Array(size/2).fill(-100);
 for(const semitone of [root,root+4,root+7]) {const f=261.625565*Math.pow(2,semitone/12);db[Math.round(f/hz)]=-24;}
 for(let i=1;i<db.length;i++) {const f=i*hz;if((kick&&f>=35&&f<=160)||(snare&&f>=250&&f<=2200)||(hat&&f>=4500&&f<=12000))db[i]=-25;}
 return db;
};
const m=new MusicFeatures();let kickPeak=0,hatPeak=0,snarePeak=0;
for(let i=0;i<30*10;i++) {const t=i/30;m.update(frame(0,t%0.5<0.06),rate,size,t);kickPeak=Math.max(kickPeak,m.kick);}
assert(Math.abs(m.bpm-120)<5,`120 BPM detected: ${m.bpm}`);assert(m.tempoConfidence>0.6);assert(kickPeak>0.5);assert.equal(m.root,0,'C major tonal center');
const firstHue=m.harmonyHue;
for(let i=300;i<360;i++)m.update(frame(2),rate,size,i/30);
assert.equal(m.root,2,'tonal center follows D major');assert.notEqual(m.harmonyHue,firstHue);
for(let i=360;i<420;i++) {m.update(frame(2,false,i%15<2,i%8<2),rate,size,i/30);hatPeak=Math.max(hatPeak,m.hat);snarePeak=Math.max(snarePeak,m.snare);}
assert(hatPeak>0.4 && snarePeak>0.4,'separate percussion envelopes');
for(let i=420;i<600;i++)m.update(new Float32Array(size/2).fill(-Infinity),rate,size,i/30,false);
assert(m.kick<0.001&&m.snare<0.001&&m.hat<0.001,'pause decays percussion');
m.reset();assert.equal(m.bpm,0);assert.equal(m.root,-1);
const faster=new MusicFeatures();for(let i=0;i<30*12;i++){let t=i/30;faster.update(frame(0,t%(60/150)<0.06),rate,size,t);}
assert(Math.abs(faster.bpm-150)<6,`150 BPM detected: ${faster.bpm}`);
for(let i=360;i<30*32;i++){let t=i/30;faster.update(frame(2,t%0.5<0.06),rate,size,t);}
assert(Math.abs(faster.bpm-120)<6,'tempo follows a change from 150 to 120 BPM');
const sustained=new MusicFeatures();for(let i=0;i<300;i++)sustained.update(frame(),rate,size,i/30);
assert.equal(sustained.bpm,0,'sustained chord does not invent repeated beats');
console.log('PASS: 120/150 BPM, kick/snare/hat detection, C-to-D harmony/palette change, pause decay and reset.');
