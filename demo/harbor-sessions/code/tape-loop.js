// tape-loop.js — a small sketch: a loop that drifts, like the machine it came from.
// Not a plugin, not a patch. Just a way to hear the room.
//
// Run with: node tape-loop.js (Node 20+). Writes a raw 16-bit WAV next to this file.

import fs from 'node:fs';

const RATE = 48000;
const SECONDS = 24;
const samples = new Int16Array(RATE * SECONDS);

// A slow ferry: two detuned sines, a little tape wobble, and a hull of noise.
let phaseA = 0;
let phaseB = 0;
let noise = 0;
for (let i = 0; i < samples.length; i += 1) {
  const t = i / RATE;
  const wobble = 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.13 * t); // the tape is never quite right
  phaseA += (2 * Math.PI * 55 * wobble) / RATE;
  phaseB += (2 * Math.PI * 82.4 * (2 - wobble)) / RATE;
  noise = noise * 0.995 + (Math.random() * 2 - 1) * 0.005;
  const envelope = Math.min(1, t / 2) * Math.min(1, (SECONDS - t) / 3);
  const value = (0.22 * Math.sin(phaseA) + 0.13 * Math.sin(phaseB) + noise * 0.5) * envelope;
  samples[i] = Math.max(-1, Math.min(1, value)) * 32767;
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + samples.byteLength, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(samples.byteLength, 40);

fs.writeFileSync(new URL('./tape-loop.wav', import.meta.url), Buffer.concat([header, Buffer.from(samples.buffer)]));
console.log('wrote tape-loop.wav — 24 seconds of a room pretending to be a ferry');
