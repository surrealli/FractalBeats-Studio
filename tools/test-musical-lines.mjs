import assert from 'node:assert/strict';
import {MusicalLines} from '../src/musical-lines.js';
const sr=44100,size=8192,hz=sr/size;
const silence=new Float32Array(size/2).fill(-Infinity);
const tone=(midi)=>{const a=new Float32Array(size/2).fill(-100);const f=440*2**((midi-69)/12);for(let h=1;h<=7;h++)a[Math.round(f*h/hz)]=-22-4*h;return a;};
const music={kick:0,snare:0,hat:0,bpm:120,tempoConfidence:1};
const a=new MusicalLines();let t=0;
for(let i=0;i<30;i++){a.update(tone(60),sr,size,t,true,music);t+=1/60;}
assert(a.lines.vocals.level>0.1,'vocal-range harmonic tone reacts');
assert(a.lines.keyboard.sustain>0.01,'sustained tone envelope');
const previous=a.lines.vocals.note;
for(let i=0;i<8;i++){a.update(tone(64),sr,size,t,true,music);t+=1/60;}
assert(a.lines.vocals.note!==previous&&a.lines.vocals.noteChange>0.1,'note change event');
for(let i=0;i<50;i++){a.update(silence,sr,size,t,false,music);t+=1/60;}
assert(a.silence>0.95&&a.lines.vocals.level<0.01,'silence and release');
for(let i=0;i<8;i++){a.update(tone(67),sr,size,t,true,music);t+=1/60;}
a.update(silence,sr,size,t,true,music);t+=1/60;
assert(a.lines.vocals.staccato>0.5,'short note offset');
for(let i=0;i<20;i++){a.update(silence,sr,size,t,true,{...music,kick:i===0?1:0,hat:i===10?1:0});t+=1/60;}
assert(a.lines.percussion.level>0,'percussion independent from harmonic notes');
const trip=new MusicalLines();for(let i=0;i<60;i++){const hit=i%10===0;trip.update(silence,sr,size,i/60,true,{...music,hat:hit?1:0});}
assert(trip.triplet>0.1,'triplet-like subdivisions at 120 BPM');
console.log('PASS harmonic response, note changes, sustained tones, silence, short notes, separate percussion, triplet-like timing.');
