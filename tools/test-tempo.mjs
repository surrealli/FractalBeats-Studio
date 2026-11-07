import assert from 'node:assert/strict';
import { MusicFeatures } from '../src/music-features.js';
for(const bpm of [60,75,90,120,127,150,180,200]) {
 const m=new MusicFeatures();let locked=null;
 for(let i=0;i<16;i++) {const t=i*60/bpm;m._tempoHit(t);if(locked===null&&m.tempoConfidence>0.35)locked=t;}
 assert(Math.abs(m.bpm-bpm)<0.1,`${bpm} BPM estimate: ${m.bpm}`);
 assert(locked<=120/bpm+0.001,`${bpm} BPM locks within two intervals`);
}
const change=new MusicFeatures();for(let i=0;i<12;i++)change._tempoHit(i*0.5);
for(let i=1;i<=3;i++)change._tempoHit(5.5+i*0.4);
assert(Math.abs(change.bpm-150)<3,'quick adaptation to faster tempo');
const jitter=new MusicFeatures();const noise=[0,0.018,-0.012,0.009,-0.016,0.014,-0.006];let sum=0,count=0;
for(let i=0;i<32;i++) {if(i===7||i===18)continue;jitter._tempoHit(i*60/127+noise[i%7]);if(i>5){sum+=Math.abs(jitter.bpm-127);count++;}}
assert(sum/count<2,'timing jitter and missed beats stay within 2 BPM mean error');
const oneHit=new MusicFeatures();oneHit._tempoHit(0);assert.equal(oneHit.bpm,0,'one attack is insufficient');
const duplicate=new MusicFeatures();for(let i=0;i<12;i++){duplicate._tempoHit(i*0.5);duplicate._tempoHit(i*0.5+0.06);}
assert(Math.abs(duplicate.bpm-120)<1,'duplicate attacks rejected');
console.log('PASS: 60–200 BPM, startup within two intervals, tempo change, jitter, missed beats, duplicate attacks.');
