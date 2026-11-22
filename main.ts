// Tiny stack VM for make.fun's tiny-stack-vm ISA (kit: ISA.md, vm.mjs).
// Answers every instance: /input/<id>/program.bin + input.bin ->
// /output/<id>/stdout.bin + exit.txt. Node 22, no deps, no network.
// Local practice: MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
// opcode -> [immediate bytes, pops, pushes]; absent byte = trap 5
const T: Record<number, number[]> = {
  0: [0, 0, 0], 1: [1, 0, 1], 2: [4, 0, 1], 3: [0, 1, 0], 4: [0, 1, 2],
  5: [0, 2, 2], 6: [0, 2, 3], 7: [0, 3, 3], 16: [0, 2, 1], 17: [0, 2, 1],
  18: [0, 2, 1], 19: [0, 2, 1], 20: [0, 2, 1], 21: [0, 2, 1], 22: [0, 2, 1],
  23: [0, 1, 1], 24: [0, 2, 1], 25: [0, 2, 1], 26: [0, 2, 1], 27: [0, 1, 1],
  28: [0, 2, 1], 29: [0, 2, 1], 30: [0, 2, 1], 32: [0, 2, 1], 33: [0, 2, 1],
  34: [0, 2, 1], 48: [2, 0, 0], 49: [2, 1, 0], 50: [2, 1, 0], 51: [2, 0, 0],
  52: [0, 0, 0], 64: [0, 1, 1], 65: [0, 2, 0], 80: [0, 1, 0], 81: [0, 1, 0],
  82: [0, 0, 1], 83: [0, 1, 0],
};
const enc = new TextEncoder();
const M = -2147483648; // INT_MIN
function run(p: Uint8Array, inp: Uint8Array): { out: Uint8Array; exit: number } {
  const d = new Int32Array(256);
  let sp = 0;
  const c = new Int32Array(64);
  let cp = 0;
  const m = new Int32Array(256);
  const o = new Uint8Array(65536);
  let ol = 0, ip = 0, pc = 0, st = 0;
  const n = p.length;
  const end = (e: number) => ({ out: o.subarray(0, ol), exit: e });
  for (;;) {
    if (st >= 1e6) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = p[pc], s = T[op];
    if (!s) return end(5);
    const [im, po, pu] = s;
    if (pc + im >= n) return end(9); // immediate cut off by program end
    st++;
    const nx = pc + 1 + im;
    if (sp < po) return end(2);
    if (sp - po + pu > 256) return end(3);
    // little-endian immediate, read before pc moves
    let v = 0;
    if (im === 1) v = p[pc + 1];
    else if (im === 2) v = p[pc + 1] | (p[pc + 2] << 8);
    else if (im === 4) v = p[pc + 1] | (p[pc + 2] << 8) | (p[pc + 3] << 16) | (p[pc + 4] << 24);
    pc = nx;
    switch (op) {
      case 0: return end(0); // HALT
      case 1: d[sp++] = (v << 24) >> 24; break; // PUSH8, sign-extended
      case 2: d[sp++] = v; break; // PUSH32
      case 3: sp--; break; // POP
      case 4: d[sp] = d[sp - 1]; sp++; break; // DUP
      case 5: { const t = d[sp - 1]; d[sp - 1] = d[sp - 2]; d[sp - 2] = t; break; } // SWAP
      case 6: d[sp] = d[sp - 2]; sp++; break; // OVER
      case 7: { const a = d[sp - 3]; d[sp - 3] = d[sp - 2]; d[sp - 2] = d[sp - 1]; d[sp - 1] = a; break; } // ROT
      case 23: d[sp - 1] = (-d[sp - 1]) | 0; break; // NEG (-INT_MIN stays)
      case 27: d[sp - 1] = ~d[sp - 1]; break; // NOT
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30: case 32:
      case 33: case 34: {
        const b = d[sp - 1], a = d[sp - 2];
        let r = 0;
        if (op === 16) r = (a + b) | 0;
        else if (op === 17) r = (a - b) | 0;
        else if (op === 18) r = Math.imul(a, b); // low 32 bits, exact
        else if (op === 19) { if (!b) return end(4); r = a === M && b === -1 ? a : (a / b) | 0; } // DIV
        else if (op === 20) { if (!b) return end(4); r = b === -1 ? 0 : (a % b) | 0; } // MOD
        else if (op === 21) { if (!b) return end(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; } // DIVU
        else if (op === 22) { if (!b) return end(4); r = ((a >>> 0) % (b >>> 0)) | 0; } // MODU
        else if (op === 24) r = a & b;
        else if (op === 25) r = a | b;
        else if (op === 26) r = a ^ b;
        else if (op === 28) r = a << (b & 31);
        else if (op === 29) r = a >> (b & 31); // arithmetic
        else if (op === 30) r = (a >>> (b & 31)) | 0; // logical
        else if (op === 32) r = a === b ? 1 : 0;
        else if (op === 33) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0; // LTU
        sp -= 2; d[sp++] = r;
        break;
      }
      case 48: case 49: case 50: { // JMP / JZ / JNZ, signed 16-bit offset
        const rel = (v << 16) >> 16;
        let take = true;
        if (op !== 48) { const x = d[--sp]; take = op === 49 ? x === 0 : x !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 51: // CALL, unsigned 16-bit target
        if (cp >= 64) return end(7);
        c[cp++] = nx; pc = v;
        break;
      case 52: // RET
        if (!cp) return end(8);
        pc = c[--cp];
        break;
      case 64: { // LOAD
        const a = d[sp - 1];
        if (a < 0 || a > 255) return end(6);
        d[sp - 1] = m[a];
        break;
      }
      case 65: { // STORE (v addr --)
        const a = d[sp - 1], x = d[sp - 2];
        if (a < 0 || a > 255) return end(6);
        sp -= 2; m[a] = x;
        break;
      }
      case 80: { // PRINT, decimal ASCII, no newline
        const b = enc.encode(String(d[sp - 1]));
        if (ol + b.length > 65536) return end(11);
        sp--; o.set(b, ol); ol += b.length;
        break;
      }
      case 81: // PUTC, one byte v & 255
        if (ol + 1 > 65536) return end(11);
        o[ol++] = d[--sp] & 255;
        break;
      case 82: // IN, -1 once input is used up
        d[sp++] = ip < inp.length ? inp[ip++] : -1;
        break;
      case 83: // EXIT, low byte of v
        return end(d[--sp] & 255);
    }
  }
}
for (const id of readdirSync(I).sort()) {
  const { out, exit } = run(readFileSync(join(I, id, 'program.bin')), readFileSync(join(I, id, 'input.bin')));
  const dir = join(O, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'stdout.bin'), out);
  writeFileSync(join(dir, 'exit.txt'), exit + '\n');
}
