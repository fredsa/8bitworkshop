import { assembleDASM2 } from "./src/worker/tools/dasm";
import { store } from "./src/worker/builder";
import * as fs from "fs";

(global as any).XMLHttpRequest = class {
    url: string;
    responseType: string;
    response: ArrayBuffer;
    onload: () => void;
    open(method: string, url: string) { this.url = url; }
    send() {
        let filename = this.url.substring(this.url.lastIndexOf('/') + 1);
        let path = "src/worker/wasm/" + filename;

        const buf = fs.readFileSync(path);
        this.response = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        if (this.onload) this.onload();
    }
};

store.getFileData = function (path) {
    if (path.startsWith('./')) path = path.slice(2);
    // simulated root files map to presets/atari8-800/
    const buf = fs.readFileSync('presets/atari8-800/' + path);
    return new Uint8Array(buf);
};

const result = assembleDASM2({
    platform: 'atari8-800',
    tool: 'dasm',
    path: "breakpoints.dasm",
    files: ["breakpoints.dasm", "atari.inc"]
} as any);

// @ts-ignore
if (result && result.output) {
    // @ts-ignore
    fs.writeFileSync('presets/atari8-800/breakpoints.bin', result.output);
    console.log("SUCCESS");
} else {
    console.log("FAILED", result);
}
