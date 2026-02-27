const fs = require('fs');
const { execSync } = require('child_process');

let needsCompile = true;
try {
    const srcTimestamp = fs.statSync('presets/atari8-800/breakpoints.dasm').mtimeMs;
    const binTimestamp = fs.statSync('presets/atari8-800/breakpoints.bin').mtimeMs;
    if (srcTimestamp < binTimestamp) {
        needsCompile = false;
    }
} catch (e) {
    // If output file doesn't exist yet, we'll try to compile.
}

if (needsCompile) {
    log("Compiling breakpoints.dasm...");
    execSync('npx ts-node compile_breakpoints.ts', { stdio: 'inherit' });
} else {
    // log("Breakpoints up to date, skipping compile.");
}

global.fetch = async function (url) {
    const path = url.toString().replace('file://', '');
    if (path.endsWith('.wasm')) {
        const buffer = fs.readFileSync(path);
        return {
            ok: true,
            arrayBuffer: async () => buffer
        };
    }
    throw new Error('Unexpected fetch: ' + url);
};

const OriginalURL = global.URL;
global.URL = function (url, base) {
    if (base === undefined && !url.toString().startsWith('file://') && !url.toString().startsWith('http')) {
        return new OriginalURL('file://' + url);
    }
    return new OriginalURL(url, base);
};
global.URL.createObjectURL = OriginalURL.createObjectURL;

global.window = global;
global.self = global;
global.screen = { width: 1024, height: 768 };
const dummyCanvas = {
    width: 672, height: 450,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 672, bottom: 450, width: 672, height: 450 }),
    style: {},
    addEventListener: () => { },
    removeEventListener: () => { },
    getContext: (type) => new Proxy({
        createImageData: () => ({ data: new Uint8Array(672 * 450 * 4) }),
        putImageData: () => { },
        getExtension: () => null,
        getSupportedExtensions: () => [],
        getParameter: () => 0,
        disable: () => { },
        enable: () => { },
        clearColor: () => { },
        clear: () => { },
        flush: () => { },
        getError: () => 0
    }, {
        get: function (target, prop) {
            if (prop in target) return target[prop];
            return typeof prop === 'string' && prop.startsWith('create') ? () => ({}) : () => 0;
        }
    })
};

global.addEventListener = () => { };
global.removeEventListener = () => { };
global.document = {
    baseURI: 'file://' + __dirname + '/',
    createElement: () => dummyCanvas,
    getElementsByTagName: () => ([{ appendChild: () => { } }]),
    getElementById: (id) => { log('getElementById', id); return dummyCanvas; },
    querySelector: (sel) => { log('querySelector', sel); return dummyCanvas; },
    addEventListener: () => { },
    removeEventListener: () => { }
};
global.navigator = { navigator: 'node' };
global.location = { href: 'file://' + __dirname + '/' };

function getTimePrefix() {
    const t = process.uptime();
    const m = Math.floor(t / 60).toString().padStart(2, '0');
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    const ms = Math.floor((t * 1000) % 1000).toString().padStart(3, '0');
    return `${m}:${s}.${ms}`;
}

function log(...args) {
    console.log(getTimePrefix(), ...args);
}

function logerror(...args) {
    console.error(getTimePrefix(), ...args);
}

const Module = {
    canvas: dummyCanvas,
    wasmBinary: fs.readFileSync('./mame/mame8bitws.wasm'),
    instantiateWasm: function (info, receiveInstance) {
        WebAssembly.instantiate(Module.wasmBinary, info).then(function (result) {
            receiveInstance(result.instance);
        });
        return {};
    },
    arguments: [
        'a800xl',
        '-window',
        '-nokeepaspect',
        '-resolution', '672x450',
        '-cart', '/emulator/cart.rom',
        '-debug',
        '-debugger', 'none',
        '-verbose'
    ],
    print: (text) => {
        log(text);
    },
    printErr: (text) => {
        logerror(`ERROR `, text);
    },
    preInit: () => {
        log("preInit called - setting up FS");
        const FS = global.FS;
        global.ENV.SDL_EMSCRIPTEN_KEYBOARD_ELEMENT = 'canvas';
        FS.mkdir('/cfg');
        try {
            const cfg = fs.readFileSync('mame/cfg/a800xl.cfg', 'utf8');
            FS.writeFile('/cfg/a800xl.cfg', cfg, { encoding: 'utf8' });
        } catch (e) {
            log("No a800xl.cfg found locally");
        }

        FS.mkdir('/roms');
        FS.mkdir('/roms/a800xl');
        try {
            const bios = fs.readFileSync('mame/roms/a800xl.zip');
            FS.writeFile('/roms/a800xl.zip', bios, { encoding: 'binary' });
            log("BIOS loaded /roms/a800xl.zip");
        } catch (e) {
            log("Missing a800xl.zip BIOS:", e.message);
        }

        FS.mkdir('/emulator');
        try {
            // Need a test binary. Let's try compiling with dasm if possible,
            // or use a pre-existing bin. For now, create 8KB cart.
            let cartData = new Uint8Array(8192);
            if (fs.existsSync('presets/atari8-800/breakpoints.bin')) {
                cartData = fs.readFileSync('presets/atari8-800/breakpoints.bin');
                log("Loaded existing breakpoints.bin.");
            } else {
                log("No breakpoints.bin found, using empty 8KB cart.");
            }
            FS.writeFile('/emulator/cart.rom', cartData, { encoding: 'binary' });
        } catch (e) {
            log("Missing cart data:", e.message);
        }
    },
    onRuntimeInitialized: () => {
        log("Runtime initialized. Loading debugger.lua...");
        try {
            const luaScript = fs.readFileSync('mame/debugger.lua', 'utf8');
            const js_lua_string = Module.cwrap('_Z13js_lua_stringPKc', 'string', ['string']);

            log("Waiting for MAME to boot...");
            setTimeout(() => {
                log("Evaluating debugger.lua...");
                js_lua_string(luaScript);

                log("\n\n\n\n\n");
                log("Calling mamedbg.init()...");
                js_lua_string("mamedbg.init()");

                // dump memory fffc - ffff
                js_lua_string("mamedbg.dumpmem(0xfffc, 0xffff)");

                log("Calling mamedbg.soft_reset()...");
                js_lua_string("mamedbg.soft_reset()");

                // log("Waiting before stepping...");
                setTimeout(() => {

                    log("==== single stepping...");
                    let count = 0;
                    let steps = 0;
                    setInterval(() => {
                        js_lua_string("mamedbg.step()");
                        steps++;
                        if (steps > 10) {
                            process.exit(0);
                        }
                    }, 0);


                    // log("==== SINGLE STEP 1 ====");
                    // js_lua_string("mamedbg.step()");
                    // setTimeout(() => {
                    //     log("==== SINGLE STEP 2 ====");
                    //     js_lua_string("mamedbg.step()");
                    //     setTimeout(() => {
                    //         log("Done.");
                    //         process.exit(0);
                    //     }, 10);
                    // }, 10);
                }, 5000);
            }, 10);

        } catch (e) {
            console.error(e);
        }
    }
};

global.Module = Module;
global.__dirname = __dirname;
global.__filename = __filename;
global.require = require;

log("Loading mame8bitws.js...");
const code = fs.readFileSync('./mame/mame8bitws.js', 'utf8');
const vm = require('vm');
vm.runInThisContext(code);
