import { StateEffect, StateField } from "@codemirror/state";
import { gutter, GutterMarker } from "@codemirror/view";

const setOffset = StateEffect.define<Map<number, number>>();
const setBytes = StateEffect.define<Map<number, string>>();
const setClock = StateEffect.define<Map<number, string>>();
const setErrors = StateEffect.define<Map<number, string>>();
const showErrorMessage = StateEffect.define<{ line: number, msg: string, toggle?: boolean } | null>();

const offsetField = StateField.define<Map<number, number>>({
    create() { return new Map(); },
    update(value, tr) {
        for (let e of tr.effects) if (e.is(setOffset)) value = e.value;
        return value;
    },
});

const bytesField = StateField.define<Map<number, string>>({
    create() { return new Map(); },
    update(value, tr) {
        for (let e of tr.effects) if (e.is(setBytes)) value = e.value;
        return value;
    },
});

const clockField = StateField.define<Map<number, string>>({
    create() { return new Map(); },
    update(value, tr) {
        for (let e of tr.effects) if (e.is(setClock)) value = e.value;
        return value;
    },
});

const errorField = StateField.define<Map<number, string>>({
    create() { return new Map(); },
    update(value, tr) {
        for (let e of tr.effects) if (e.is(setErrors)) value = e.value;
        return value;
    },
});

// Track which lines have error messages currently shown.
const shownErrorLinesField = StateField.define<Set<number>>({
    create() { return new Set(); },
    update(value, tr) {
        for (let e of tr.effects) {
            if (e.is(showErrorMessage)) {
                const newSet = new Set(value);
                if (e.value === null) {
                    // Clear all shown messages
                    return new Set();
                } else if (e.value.toggle) {
                    // Toggle specific line
                    if (newSet.has(e.value.line)) {
                        newSet.delete(e.value.line);
                    } else {
                        newSet.add(e.value.line);
                    }
                    return newSet;
                }
            }
        }
        return value;
    },
});

class OffsetMarker extends GutterMarker {
    constructor(readonly hex: string) { super(); }
    toDOM() { return document.createTextNode(this.hex); }
}

class BytesMarker extends GutterMarker {
    constructor(readonly bytes: string) { super(); }
    toDOM() { return document.createTextNode(this.bytes); }
}

class ClockMarker extends GutterMarker {
    constructor(readonly clock: string) { super(); }
    toDOM() { return document.createTextNode(this.clock); }
}

class ErrorMarker extends GutterMarker {
    constructor(readonly line: number, readonly msg: string) { super(); }

    toDOM() {
        const span = document.createElement("span");
        span.innerHTML = "ⓧ";
        span.style.color = "red";
        span.style.cursor = "pointer";
        span.title = this.msg;
        return span;
    }
}

const offsetGutter = gutter({
    class: "gutter-offset",
    lineMarker(view, line) {
        const offsets = view.state.field(offsetField);
        const lineNum = view.state.doc.lineAt(line.from).number;
        const addr = offsets.get(lineNum);
        return addr ? new OffsetMarker(addr.toString(16).padStart(4, '0').toUpperCase()) : null;
    },
    lineMarkerChange(update) {
        return update.startState.field(offsetField) !== update.state.field(offsetField);
    },
});

const bytesGutter = gutter({
    class: "gutter-bytes",
    lineMarker(view, line) {
        const bytesMap = view.state.field(bytesField);
        const lineNum = view.state.doc.lineAt(line.from).number;
        const bytesValue = bytesMap.get(lineNum);
        return bytesValue ? new BytesMarker(bytesValue) : null;
    },
    lineMarkerChange(update) {
        return update.startState.field(bytesField) !== update.state.field(bytesField);
    },
});

const clockGutter = gutter({
    class: "gutter-clock",
    lineMarker(view, line) {
        const clockMap = view.state.field(clockField);
        const lineNum = view.state.doc.lineAt(line.from).number;
        const clockValue = clockMap.get(lineNum);
        return clockValue ? new ClockMarker(clockValue) : null;
    },
    lineMarkerChange(update) {
        return update.startState.field(clockField) !== update.state.field(clockField);
    },
});

const errorGutter = gutter({
    class: "cm-error-gutter",
    lineMarker(view, line) {
        const errors = view.state.field(errorField);
        const lineNum = view.state.doc.lineAt(line.from).number;
        const msg = errors.get(lineNum);
        return msg ? new ErrorMarker(lineNum, msg) : null;
    },
    lineMarkerChange(update) {
        return update.startState.field(errorField) !== update.state.field(errorField);
    },
    initialSpacer: () => new ErrorMarker(0, ""),
    domEventHandlers: {
        click(view, line) {
            const errors = view.state.field(errorField);
            const lineNum = view.state.doc.lineAt(line.from).number;
            const msg = errors.get(lineNum);
            if (msg) {
                view.dispatch({
                    effects: showErrorMessage.of({ line: lineNum, msg, toggle: true })
                });
            }
            return true;
        }
    }
});

export const offset = {
    set: setOffset,
    field: offsetField,
    gutter: offsetGutter,
};

export const bytes = {
    set: setBytes,
    field: bytesField,
    gutter: bytesGutter,
};

export const clock = {
    set: setClock,
    field: clockField,
    gutter: clockGutter,
};

export const errorMarkers = {
    set: setErrors,
    field: errorField,
    gutter: errorGutter,
    shownLinesField: shownErrorLinesField,
    showMessage:showErrorMessage
};