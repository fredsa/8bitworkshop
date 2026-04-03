#!/usr/bin/env node

// Reformat all platform project source files in the presets directory.
// For each main file: detect tab stops, format the file and its includes.

import * as fs from 'fs';
import * as path from 'path';
import { formatText } from '../common/format-asm';
import { detectTabSizeFromSource, detectTabStopsFromAsm, Dialect } from '../common/tabdetect';
import { getDialect, getToolForFilename_6502, getToolForFilename_6809, getToolForFilename_z80 } from '../common/toolutil';
import { getBasePlatform, isProbablyBinary } from '../common/util';
import { PLATFORM_PARAMS } from '../worker/platforms';

const DEFAULT_TAB_SIZE = 8;
const PRESETS_DIR = path.resolve(__dirname, '../../presets');
const mode = process.argv[2]; // 'detab' or undefined

// Source file extensions that can be main files (not pure includes)
const MAIN_EXTENSIONS = new Set([
  // Preset main files:
  //   git grep name -- src/platform \
  //     | tr -d ' ' \
  //     | grep -E '^.*:[^/]*{.*id.*:.*.*,.*name.*:.*}.*' \
  //     | sed -e "s/:{id:'\([^']*\)'.*/\1/"
  //     | sed -e 's/.*\.//' \
  //     | sort -u
  'a', 'acme', 'asm', 'bas', 'c', 'c78', 'cc2600', 'dasm',
  'ice', 'inf', 'md', 'sgb', 'v', 'wiz', 'xasm',

  // Skeleton files:
  //   git ls-files presets \
  //     | grep '/skeleton\.' \
  //     | sed -e 's/.*\.//' \
  //     | sort -u
  '.acme', '.armtcc', '.basic', '.bataribasic', '.ca65', '.cc2600', '.cc65',
  '.cc7800', '.cmoc', '.dasm', '.fastbasic', '.inform6', '.markdown',
  '.nesasm', '.remote:llvm-mos', '.sdcc', '.silice', '.verilator',
  '.xasm6809', '.yasm', '.zmac',
]);


function getToolForFilename(fn: string, arch: string): string {
  switch (arch) {
    case 'z80':
    case 'gbz80':
      return getToolForFilename_z80(fn);
    case '6502':
      return getToolForFilename_6502(fn);
    case '6809':
      return getToolForFilename_6809(fn);
    default:
      return getToolForFilename_z80(fn);
  }
}

function parseIncludeFiles(text: string): string[] {
  const files: string[] = [];
  let m;
  // Assembly includes: .include "file", #include "file", %include "file", include "file"
  const re1 = /^\s*[.#%]?(include|incbin)\s+"(.+?)"/gmi;
  while (m = re1.exec(text)) { files.push(m[2]); }
  // ACME !src "file"
  const re2 = /^[!]src\s+"(.+?)"/gmi;
  while (m = re2.exec(text)) { files.push(m[1]); }
  // Wiz import "file"
  const re3 = /^\s*import\s+"(.+?)"/gmi;
  while (m = re3.exec(text)) { files.push(m[1]); }
  return files;
}

interface FormatResult {
  file: string;
  dialect: Dialect;
  formatted: boolean;
  tabStops?: number[];
  tabSize?: number;
  includes?: string[];
}

function formatFile(filePath: string, text: string, dialect: Dialect, tabSize: number, stops: number[]): string | null {
  switch (dialect) {
    case '6502':
    case 'z80':
    case '6809':
      return formatText(text, tabSize, stops);
    default:
      // TODO: implement formatting for dialect: ${dialect}
      return null;
  }
}

function processMainFile(filePath: string, arch: string, platformDir: string): FormatResult {
  const filename = path.basename(filePath);
  const text = fs.readFileSync(filePath, 'utf-8');
  const tool = getToolForFilename(filename, arch);
  const dialect = getDialect(tool);

  const result: FormatResult = {
    file: path.relative(PRESETS_DIR, filePath),
    dialect,
    formatted: false,
  };

  // Detect tab stops from main file
  let tabSize = DEFAULT_TAB_SIZE;
  let stops: number[] = [];

  switch (dialect) {
    case '6502':
    case 'z80':
    case '6809':
      stops = detectTabStopsFromAsm(text, dialect, DEFAULT_TAB_SIZE);
      break;
    case 'c':
      tabSize = detectTabSizeFromSource(text) || DEFAULT_TAB_SIZE;
      break;
  }

  result.tabStops = stops;
  result.tabSize = tabSize;

  // Format the main file
  const formatted = formatFile(filePath, text, dialect, tabSize, stops);
  if (formatted !== null && formatted !== text) {
    fs.writeFileSync(filePath, formatted, 'utf-8');
    result.formatted = true;
  }

  // Find and format include files
  const includeNames = parseIncludeFiles(text);
  result.includes = [];

  for (const incName of includeNames) {
    if (isProbablyBinary(incName)) continue;
    const incPath = path.resolve(platformDir, incName);
    if (!fs.existsSync(incPath)) continue;

    result.includes.push(incName);

    try {
      const incText = fs.readFileSync(incPath, 'utf-8');
      // Use the same dialect/stops from the main file for includes
      const incFormatted = formatFile(incPath, incText, dialect, tabSize, stops);
      if (incFormatted !== null && incFormatted !== incText) {
        fs.writeFileSync(incPath, incFormatted, 'utf-8');
      }
    } catch (e) {
      // skip binary or unreadable files
    }
  }

  return result;
}

function isMainFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return MAIN_EXTENSIONS.has(ext);
}

const SUPPORTED_ARCHS = new Set(['6502', 'z80', 'gbz80', '6809']);

function getArch(platformId: string): string | undefined {
  const params = PLATFORM_PARAMS[getBasePlatform(platformId)];
  const arch = params && params.arch;
  if (!arch || !SUPPORTED_ARCHS.has(arch)) return undefined;
  return arch;
}

// Walk preset directories and collect all files
function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

// Text file extensions eligible for detab
const TEXT_EXTENSIONS = new Set([
  ...MAIN_EXTENSIONS,
  '.h', '.inc',
]);

function expandTabs(text: string, tabSize: number): string {
  return text.split('\n').map(line => {
    let result = '';
    let col = 0;
    for (const ch of line) {
      if (ch === '\t') {
        const spaces = tabSize - (col % tabSize);
        result += ' '.repeat(spaces);
        col += spaces;
      } else {
        result += ch;
        col++;
      }
    }
    return result;
  }).join('\n');
}

function transformTextFiles(label: string, transform: (text: string) => string) {
  const platformDirs = fs.readdirSync(PRESETS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  let totalConverted = 0;
  let totalSkipped = 0;

  for (const platformId of platformDirs) {
    const platformDir = path.join(PRESETS_DIR, platformId);
    const allFiles = collectFiles(platformDir);
    const textFiles = allFiles.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return TEXT_EXTENSIONS.has(ext) && !isProbablyBinary(f);
    });

    let platformPrinted = false;

    for (const filePath of textFiles) {
      const text = fs.readFileSync(filePath, 'utf-8');
      const converted = transform(text);
      if (converted !== text) {
        if (!platformPrinted) {
          console.log(`\n${platformId}:`);
          platformPrinted = true;
        }
        fs.writeFileSync(filePath, converted, 'utf-8');
        const relPath = path.relative(platformDir, filePath);
        console.log(`  ✓ ${relPath}`);
        totalConverted++;
      } else {
        totalSkipped++;
      }
    }
  }

  console.log(`\nDone: ${totalConverted} ${label}, ${totalSkipped} skipped`);
}

function stripTrailingWhitespace(text: string): string {
  return text.split('\n').map(line => line.replace(/[\t ]+$/, '')).join('\n');
}

function reformat() {
  const platformDirs = fs.readdirSync(PRESETS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  let totalFormatted = 0;
  let totalSkipped = 0;
  let totalMain = 0;

  for (const platformId of platformDirs) {
    const arch = getArch(platformId);
    if (!arch) continue;

    const platformDir = path.join(PRESETS_DIR, platformId);
    const allFiles = collectFiles(platformDir);
    const mainFiles = allFiles.filter(f => isMainFile(path.basename(f)));

    if (mainFiles.length === 0) continue;

    console.log(`\n${platformId} (${arch}):`);

    for (const filePath of mainFiles) {
      totalMain++;
      const result = processMainFile(filePath, arch, platformDir);
      const relPath = path.relative(platformDir, filePath);
      const stopsStr = result.tabStops?.length ? ` stops=[${result.tabStops.join(',')}]` : '';
      const sizeStr = result.tabSize !== DEFAULT_TAB_SIZE ? ` tabSize=${result.tabSize}` : '';
      const incStr = result.includes?.length ? ` includes=[${result.includes.join(',')}]` : '';

      if (result.formatted) {
        console.log(`  ✓ ${relPath} (${result.dialect}${stopsStr}${sizeStr}${incStr})`);
        totalFormatted++;
      } else {
        const reason = (result.dialect !== '6502' && result.dialect !== 'z80' && result.dialect !== '6809')
          ? `TODO:${result.dialect}` : 'unchanged';
        console.log(`  - ${relPath} (${reason}${stopsStr}${sizeStr}${incStr})`);
        totalSkipped++;
      }
    }
  }

  console.log(`\nDone: ${totalFormatted} formatted, ${totalSkipped} skipped, ${totalMain} total main files`);
}

if (mode === 'detab') {
  transformTextFiles('detabbed', text => expandTabs(text, DEFAULT_TAB_SIZE));
} else if (mode === 'strip-trailing-ws') {
  transformTextFiles('stripped', stripTrailingWhitespace);
} else {
  reformat();
}
