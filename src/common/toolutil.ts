// Tool and dialect utilities — no browser or CodeMirror dependencies.

import { Dialect } from "./tabdetect";

export function getToolForFilename_6502(fn: string): string {
  if (fn.endsWith("-llvm.c")) return "remote:llvm-mos";
  if (fn.endsWith(".c")) return "cc65";
  if (fn.endsWith(".h")) return "cc65";
  if (fn.endsWith(".s")) return "ca65";
  if (fn.endsWith(".ca65")) return "ca65";
  if (fn.endsWith(".dasm")) return "dasm";
  if (fn.endsWith(".acme")) return "acme";
  if (fn.endsWith(".wiz")) return "wiz";
  if (fn.endsWith(".ecs")) return "ecs";
  if (fn.endsWith(".cpp")) return "oscar64";
  if (fn.endsWith(".cc")) return "oscar64";
  if (fn.endsWith(".o64")) return "oscar64";
  return "dasm"; // .a
}

export function getToolForFilename_z80(fn: string): string {
  if (fn.endsWith(".c")) return "sdcc";
  if (fn.endsWith(".h")) return "sdcc";
  if (fn.endsWith(".s")) return "sdasz80";
  if (fn.endsWith(".sgb")) return "sdasgb";
  if (fn.endsWith(".ns")) return "naken";
  if (fn.endsWith(".scc")) return "sccz80";
  if (fn.endsWith(".z")) return "zmac";
  if (fn.endsWith(".wiz")) return "wiz";
  return "zmac";
}

export function getToolForFilename_6809(fn: string): string {
  if (fn.endsWith(".c")) return "cmoc";
  if (fn.endsWith(".h")) return "cmoc";
  if (fn.endsWith(".xasm")) return "xasm6809";
  if (fn.endsWith(".lwasm")) return "lwasm";
  return "cmoc";
}

export function getDialect(tool: string): Dialect {
  switch (tool) {
    case 'dasm':
    case 'ca65':
    case 'acme':
      return '6502';
    case 'zmac':
    case 'sdasz80':
    case 'sdasgb':
    case 'naken':
      return 'z80';
    case 'xasm6809':
    case 'lwasm':
      return '6809';
    case 'cc65':
    case 'sdcc':
    case 'cmoc':
    case 'oscar64':
    case 'sccz80':
      return 'c';
    case 'bataribasic':
      return 'basic';
    default:
      return 'unknown';
  }
}
