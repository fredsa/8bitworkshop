// Tool and dialect utilities — no browser or CodeMirror dependencies.

import { Dialect } from "./tabdetect";

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
