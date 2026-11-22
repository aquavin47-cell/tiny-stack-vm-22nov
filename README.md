# tiny-stack-vm

A tiny stack virtual machine for the [make.fun](https://make.fun/bounty/tiny-stack-vm-01-run-20261122) bounty "Build a tiny stack virtual machine, 22 November 2026".

`main.ts` (Node 22, no dependencies) runs every program of make.fun's tiny stack ISA in `/input/<id>/` and writes `/output/<id>/stdout.bin` and `/output/<id>/exit.txt`: 32-bit wrapping arithmetic, a 256-value stack, calls, 256 words of memory, input/output, and all ten traps with their exit codes.

Practice set: **1,000,000 / 1,000,000** (40/40 instances), above the house baseline's 670,000.

Local run: `MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts`
