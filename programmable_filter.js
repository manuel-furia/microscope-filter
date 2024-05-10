document.getElementById("filter-code").addEventListener("input", e =>
    updatePreview(e.target.value)
);

function streamCode(code) {
    let index = 0;
    return {
        read: () => code[index++],
        peek: () => code[index],
        eof: () => index >= code.length
    }
}

function hexDigitsToBinary(data) {
    result = "";
    for (let i = 0; i < data.length; i++) {
        const value = parseInt(data[i], 16);
        result += value.toString(2).padEnd(4, "0");
    }
    return result;
}

function binaryToIndices(binary, bits) {
    const indices = [];
    for (let i = 0; i < binary.length; i += bits) {
        const value = parseInt(binary.slice(i, i + bits), 2);
        indices.push(value);
    }
    return indices;
}

function indicesToBinary(indices, bits) {
    let result = "";
    for (let i = 0; i < indices.length; i++) {
        result += indices[i].toString(2).padStart(bits, "0");
    }
    return result;
}

function rearrangeIndicesbyBlock(indices, width, height) {
    const xBlocks = (width / 16) | 0;
    const yBlocks = (height / 16) | 0;
    const rearranged = new Array(width * height).fill(0);
    let index = 0;
    for (let bx = 0; bx < xBlocks; bx++) {
        for (let by = 0; by < yBlocks; by++) {
            for (let y = 0; y < 16; y++) {
                for (let x = 0; x < 16; x++) {
                    const sourceIndex = (by * 16 + y) * width + bx * 16 + x;
                    rearranged[index++] = indices[sourceIndex];
                }
            }
        }
    }
    return rearranged;
}

const previewCanvas = document.getElementById("filter-preview");
const previewCanvasContext = previewCanvas.getContext("2d");
const previewState = {
    palette: [],
    bitmaps: [],
    animations: [],
    animationStartTime: Date.now(),
    animationElapsedTime: 0,
};

function updatePreview(code) {
    previewState.palette = [];
    previewState.bitmaps = [];
    previewState.animations = [];
    previewState.animationElapsedTime = 0;
    previewState.animationStartTime = Date.now();
    try {
        previewCode(streamCode(code), previewState.bitmaps, previewState.palette, previewState.animations);
        document.getElementById("filter-code").classList.remove("error");
    } catch (e) {
        document.getElementById("filter-code").classList.add("error");
    }
}

function drawPreviewBitmaps(bitmaps, palette, animations) {
    if (animations.length > 0) {
        applyKeyFrame(bitmaps, palette, animations, previewState);
    }
    previewCanvasContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    for (const bitmap of bitmaps) {
        if (bitmap.visible) {
            drawPreviewBitmap(bitmap, palette);
        }
    }
}

function getAnimationLength(animations) {
    return animations.reduce((sum, { duration }) => sum + duration, 0);
}

function applyKeyFrame(bitmaps, palette, animation, state) {
    const total_length = getAnimationLength(animation);
    if (state.animationStartTime + total_length < Date.now()) {
        state.animationStartTime = Date.now();
        state.animationElapsedTime = 0;
    }
    let currentT = state.animationElapsedTime;
    for (const { duration, components } of animation) {
        if (currentT < duration) {
            for (const component of components) {
                if (component.type === "bitmapkf") {
                    bitmaps[component.index].x = component.x - (bitmaps[component.index].width / 2) | 0;
                    bitmaps[component.index].y = component.y - (bitmaps[component.index].height / 2) | 0;
                    bitmaps[component.index].visible = component.visible;
                } else if (component.type === "palettekf") {
                    palette[component.index] = { r: component.r, g: component.g, b: component.b };
                }
            }
            break;
        }
        currentT -= duration;
    }
    state.animationElapsedTime = Date.now() - state.animationStartTime;
    console.log(state.animationElapsedTime, total_length);
}

function bitmapToBCommand(bitmap) {
    const { x, y, width, height, pixels } = bitmap;
    const maxColor = pixels.reduce((max, color) => Math.max(max, color), 0);
    const bits = Math.ceil(Math.log2(maxColor + 1));
    const data = indicesToBinary(rearrangeIndicesbyBlock(pixels, width, height), 8);
    const hexData = [];
    for (let i = 0; i < data.length; i += 4) {
        const value = parseInt(data.slice(i, i + 4), 2).toString(16).toUpperCase();
        hexData.push(value);
    }
    if (hexData.length % 2 === 1) {
        hexData.push("0");
    }
    let hexString = hexData.join("");
    return `B${x.toString(16).toUpperCase().padStart(3, "0")}${y.toString(16).toUpperCase().padStart(3, "0")}${((width/16)|0).toString(16).toUpperCase().padStart(2, "0")}${((height/16)|0).toString(16).toUpperCase().padStart(2, "0")}${bits}${hexString.toUpperCase()}`;
}

function drawPreviewBitmap(bitmap, palette) {
    const { x, y, width, height, pixels } = bitmap;
    const imageData = previewCanvasContext.createImageData(width, height);
    for (let i = 0; i < pixels.length; i++) {
        const color = palette[pixels[i]];
        const j = i * 4;
        imageData.data[j] = color.r;
        imageData.data[j + 1] = color.g;
        imageData.data[j + 2] = color.b;
        imageData.data[j + 3] = 255;
    }
    previewCanvasContext.putImageData(imageData, x - width / 2, y - width / 2);
}

setInterval(() => drawPreviewBitmaps(previewState.bitmaps, previewState.palette, previewState.animations), 1000 / 32);

function previewCode(stream, bitmaps, palette, animations) {
    if (stream.eof()) {
        return;
    }
    if (stream.peek() !== "<") {
        throw new Error("Expected < to start the code");
    }
    while(stream.peek() === "<") {
        expect(stream, "<");
        parseCommand(stream);
        expect(stream, ">")
    }

    function parseCommand(stream) {
        const command = stream.peek();
        switch(command) {
            case "P": parsePalette(stream); break;
            case "M": parseModifyPalette(stream); break;
            case "Z": parseClear(stream); break;
            case "B": parseBitmap(stream); break;
            case "T": parseTemplate(stream); break;
            case "A": parseAnimationFrame(stream); break;
            default: throw new Error(`Unknown command: ${command}`);
        }
    }
    function parseAnimationFrame(stream) {
        // <ADD...BIIXXXYYYV...PIIRRGGBB...>
        expect(stream, "A");
        const duration = parseHexByte(stream) * 16;
        const components = [];
        while (stream.peek() !== ">") {
            const type = stream.peek();
            switch(type) {
                case "B": components.push(parseBitmapKeyFrame(stream)); break;
                case "P": components.push(parsePaletteKeyFrame(stream)); break;
                default: throw new Error(`Unknown animation component: ${type}`);
            }
        }
        animations.push({ duration, components } );
    }
    function parseBitmapKeyFrame(stream) {
        // BIIXXXYYYV
        expect(stream, "B");
        const index = parseHexByte(stream);
        const x = parse3DigitHexNumber(stream);
        const y = parse3DigitHexNumber(stream);
        const visible = stream.read() === "V";
        return { type: "bitmapkf", index, x, y, visible };
    }
    function parsePaletteKeyFrame(stream) {
        // PIIRRGGBB
        expect(stream, "P");
        const index = parseHexByte(stream);
        const r = parseHexByte(stream);
        const g = parseHexByte(stream);
        const b = parseHexByte(stream);
        return { type: "palettekf", index, r, g, b };
    }
    function parseModifyPalette(stream) {
        expect(stream, "M");
        const index = parseHexByte(stream);
        const r = parseHexByte(stream);
        const g = parseHexByte(stream);
        const b = parseHexByte(stream);
        const color = { r, g, b };
        if (index < palette.length) {
            palette[index] = color;
        }
    }
    function parsePalette(stream) {
        expect(stream, "P");
        if (stream.peek() === ">") {
            stream.read();
            palette = [];
            return;
        }
        const r = parseHexByte(stream);
        const g = parseHexByte(stream);
        const b = parseHexByte(stream);
        const color = { r, g, b };
        addPalette(palette, color);
    }
    function parseClear(stream) {
        expect(stream, "Z");
        bitmaps.length = 0;
        animations.length = 0;
    }
    function parseBitmap(stream) {
        expect(stream, "B");
        const x = parse3DigitHexNumber(stream);
        const y = parse3DigitHexNumber(stream);
        const width = parse3DigitHexNumber(stream);
        const height = parse3DigitHexNumber(stream);
        const bits = parseHexDigit(stream);
        const data = [];
        while (stream.peek() !== ">") {
            const digit = stream.read();
            data.push(digit);
        }
        const binary = hexDigitsToBinary(data);
        const pixels = binaryToIndices(binary, bits);
        addBitmap(x, y, width, height, pixels);
    }
    function parseTemplate(stream) {
        // <TXXXYYYC0...disks_and_sections...>
        expect(stream, "T");
        const x = parse3DigitHexNumber(stream);
        const y = parse3DigitHexNumber(stream);
        const s = parse3DigitHexNumber(stream);
        const backgroundColor = parseColorRef(stream);
        const components = [];
        while (stream.peek() !== ">") {
            const type = stream.peek();
            switch(type) {
                case "D": components.push(parseDisk(stream)); break;
                case "S": components.push(parseSection(stream)); break;
                default: throw new Error(`Unknown template type: ${type}`);
            }
        }
        addTemplate(x, y, s, s, backgroundColor, components);
    }
    function parseDisk(stream) {
        // DCCRRR
        expect(stream, "D");
        const radius = parse3DigitHexNumber(stream);
        const color = parseColorRef(stream);
        return { type : "disk", color, radius };
    }
    function parseSection(stream) {
        // SNCC
        expect(stream, "S");
        const index = parseHexDigit(stream);
        const color = parseColorRef(stream);
        return { type : "section", index, color };
    }
    function parseColorRef(stream) {
        return parseHexByte(stream) ;
    }
    function parseHexDigit(stream) {
        const char = stream.read();
        if (char >= "0" && char <= "9") {
            return char.charCodeAt(0) - "0".charCodeAt(0);
        } else if (char >= "A" && char <= "F") {
            return char.charCodeAt(0) - "A".charCodeAt(0) + 10;
        } else {
            throw new Error(`Invalid hex character: ${char}`);
        }
    }
    function parseHexByte(stream) {
        const high = parseHexDigit(stream);
        const low = parseHexDigit(stream);
        return high * 16 + low;
    }

    function parse3DigitHexNumber(stream) {
        const first = parseHexDigit(stream);
        const second = parseHexDigit(stream);
        const third = parseHexDigit(stream);
        return first * 256 + second * 16 + third;
    }   

    function expect(stream, expected) {
        const token = stream.read();
        if (token !== expected) {
            throw new Error(`Expected ${expected} but got ${token}`);
        }
    }
    function addPalette(palette, color) {
        palette.push(color);
    }
    function addBitmap(x, y, width, height, pixels) {
        bitmaps.push({ x, y, width, height, pixels, visible: true });
    }
    function addTemplate(x, y, w, h, backgroundColor, components) {
        // Build the bitmap
        const bitmap = new Array(w * h).fill(backgroundColor);
        for (const component of components) {
            if (component.type === "disk") {
                addDisk(w, h, bitmap, component);
            } else if (component.type === "section") {
                addSection(w, h, bitmap, component);
            }
        }
        bitmaps.push({ x: x, y: y, width: w, height: h, pixels: bitmap, visible: true });
    }
    function addDisk(w, h, bitmap, disk) {
        const { color, radius } = disk;
        const cx = w / 2;
        const cy = h / 2;
        for (let y = 0; y < w; y++) {
            for (let x = 0; x < h; x++) {
                const dx = x - cx;
                const dy = y - cy;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < radius) {
                    bitmap[y * w + x] = color;
                }
            }
        }
    }
    function addSection(w, h, bitmap, section) {
        // There are 4 sections in the plane
        const { index, color } = section;
        const cx = w / 2;
        const cy = h / 2;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const dx = x - cx;
                const dy = cy - y;
                if (index == 0 && dx >= 0 && dy >= 0) {
                    bitmap[y * w + x] = color;
                } else if (index == 1 && dx < 0 && dy >= 0) {
                    bitmap[y * w + x] = color;
                } else if (index == 2 && dx < 0 && dy < 0) {
                    bitmap[y * w + x] = color;
                } else if (index == 3 && dx >= 0 && dy < 0) {
                    bitmap[y * w + x] = color;
                }
            }
        }
    }
    
}

