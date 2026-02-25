const fs = require('fs');
const { assembleDASM2 } = require('./gen/worker/tools/dasm.js');
const { store } = require('./gen/builder.js');

store.getFileData = function (path) {
    if (path.startsWith('./')) path = path.slice(2);
    if (!fs.existsSync(path)) throw new Error("File not found: " + path);
    const buf = fs.readFileSync(path);
    return new Uint8Array(buf);
}

// Dummy step
const step = {
    prefix: 'breakpoints',
    path: 'presets/atari8-800/breakpoints.dasm',
    files: [
        'presets/atari8-800/breakpoints.dasm',
        'presets/atari8-800/atari.inc'
    ]
};

const result = assembleDASM2(step);

if (result.errors && result.errors.length) {
    console.error("Compilation errors:", result.errors);
    process.exit(1);
}

fs.writeFileSync('presets/atari8-800/breakpoints.bin', result.output);
console.log("Compiled to presets/atari8-800/breakpoints.bin");
