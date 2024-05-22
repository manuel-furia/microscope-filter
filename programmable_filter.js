const filterLibrary = [];

const previewCanvas = document.getElementById("filter-preview");
const previewCanvasContext = previewCanvas.getContext("2d");
const previewState = {
    palette: [],
    bitmaps: [],
    animations: [],
    animationStartTime: Date.now(),
    animationElapsedTime: 0,
    selectedFilterIndex: 0,
    painted: false,
    sent: false,
    lastSent: 0,
    port: null,
    parsed: null
};

if (localStorage.getItem("editing") !== null) {
    loadFilterLibrary(localStorage.getItem("editing"));
} else {
    loadFilterLibrary(DEFAULT_FILTERS)
}

function sendCommand(command) {
    if (previewState.port && previewState.port.writable && !previewState.port.writable.locked && previewState.lastSent + 1000 < Date.now()) {
        let writer = previewState.port.writable.getWriter();
        writer.write(new TextEncoder().encode("<Z><P>" + command)).then(() => {
            writer.releaseLock();
        });
        return true;
    }
    return false;
}

document.getElementById("connect-button").addEventListener("click", e => {
    if (previewState.port) {
        previewState.port.close().then(() => {
            previewState.port = null;
            document.getElementById("connect-button").innerText = "Connect";
        });
        return;
    }
    navigator.serial.requestPort().then(port => {
        previewState.port = port;
        port.open({ baudRate: 115200 }).then(() => {
            document.getElementById("connect-button").innerText = "Disconnect";
        });
    });
});

function updateFilterList() {
    const filterList = document.getElementById("filter-list");
    Array.from(filterList.children).forEach(child => {
        if (child.classList.contains("filter-item")) {
            child.remove();
        }
    });
    filterLibrary.forEach((filter, index) => {
        const filterElement = document.createElement("div");
        filterElement.classList.add("filter-item");
        if (index === previewState.selectedFilterIndex) {
            filterElement.classList.add("filter-item-selected");
        }
        filterElement.style.background = filter.image ? `url(${filter.image})` : "white";
        filterElement.style.backgroundSize = "cover";
        filterElement.addEventListener("click", e => {
            previewState.selectedFilterIndex = index;
            loadCodeAndParameters();
        });
        filterList.insertBefore(filterElement, document.getElementById("add-filter"));
    });
}

function loadCodeAndParameters() {
    if (previewState.selectedFilterIndex >= filterLibrary.length) {
        document.getElementById("filter-name").value = "";
        document.getElementById("filter-code").value = "";
        document.getElementById("filter-width").value = 240;
        document.getElementById("filter-height").value = 240;
        updatePreview(selectedFilter.code);
        return;
    }
    let selectedFilter = filterLibrary[previewState.selectedFilterIndex];
    document.getElementById("filter-name").value = selectedFilter.name;
    document.getElementById("filter-code").value = selectedFilter.code;
    document.getElementById("filter-width").value = selectedFilter.size.width;
    document.getElementById("filter-height").value = selectedFilter.size.height;
    selectedFilter.parameterValues.forEach(parameter => {
        let element = document.getElementById(`filter-${parameter.key}`);
        if (element) {
            element.value = parameter.value;
        }
    });
    updatePreview(selectedFilter.code);
}

updateFilterList();

document.getElementById("filter-width").addEventListener("input", e => {
    setFilterData();
    updatePreview(document.getElementById("filter-code").value);
});

document.getElementById("filter-height").addEventListener("input", e => {
    setFilterData();
    updatePreview(document.getElementById("filter-code").value);
});

document.getElementById("filter-name").addEventListener("input", e => {
    setFilterData();
});

Array.from(document.getElementsByClassName("filter-range")).forEach(range => {
    range.addEventListener("input", e => {
        setFilterData();
        updatePreview(document.getElementById("filter-code").value);
    });
});

Array.from(document.getElementsByClassName("filter-color")).forEach(color => {
    color.addEventListener("input", e => {
        setFilterData();
        updatePreview(document.getElementById("filter-code").value);
    });
});

document.getElementById("duplicate-button").addEventListener("click", e => {
    if (previewState.selectedFilterIndex < filterLibrary.length) {
        let selectedFilter = filterLibrary[previewState.selectedFilterIndex];
        filterLibrary.push({
            name: selectedFilter.name,
            code: selectedFilter.code,
            size: { width: selectedFilter.size.width, height: selectedFilter.size.height },
            image: selectedFilter.image,
            parameterValues: selectedFilter.parameterValues
        });
        updateFilterList();
    }
});

document.getElementById("delete-button").addEventListener("click", e => {
    if (previewState.selectedFilterIndex < filterLibrary.length) {
        filterLibrary.splice(previewState.selectedFilterIndex, 1);
        previewState.selectedFilterIndex = Math.max(0, previewState.selectedFilterIndex - 1);
        loadCodeAndParameters();
        updateFilterList();
    }
});

document.getElementById("save-button").addEventListener("click", e => {
    let data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filterLibrary));
    let link = document.createElement("a");
    link.setAttribute("href", data);
    link.setAttribute("download", "filters.filterlist");
    link.click();
});

function loadFilterLibrary(json) {
    filterLibrary.length = 0;
    const data = JSON.parse(json);
    data.forEach(filter => {
        filterLibrary.push(filter);
    });
    updateFilterList();
    previewState.selectedFilterIndex = 0;
    loadCodeAndParameters();
}

document.getElementById("load-button").addEventListener("click", e => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".filterlist";
    input.addEventListener("change", e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = e => {
            loadFilterLibrary(e.target.result);
        };
        reader.readAsText(file);
    });
    input.click();
    input.remove();
});


document.getElementById("filter-code").addEventListener("input", e => {
    setFilterData();
    updatePreview(e.target.value)
});

document.getElementById("add-filter").addEventListener("click", e => {
    filterLibrary.push({
        name: "",
        code: "",
        size: { width: 240, height: 240},
        image: null,
        parameterValues: []
    });
    previewState.selectedFilterIndex = filterLibrary.length - 1;
    document.getElementById("filter-code").value = "";
    setFilterData();
    resetPreviewState();
    updateFilterList();
});

function setFilterData() {
    let filterParameters = [];
    Array.from(document.getElementsByClassName("filter-range")).forEach(range => {
        filterParameters.push({ key: range.id.substring(7), value: range.value });
    });
    Array.from(document.getElementsByClassName("filter-color")).forEach(color => {
        filterParameters.push({ key: color.id.substring(7), value: color.value });
    });
    filterLibrary[previewState.selectedFilterIndex].parameterValues = filterParameters;
    filterLibrary[previewState.selectedFilterIndex].name = document.getElementById("filter-name").value;
    filterLibrary[previewState.selectedFilterIndex].code = document.getElementById("filter-code").value;
    filterLibrary[previewState.selectedFilterIndex].size.width = parseInt(document.getElementById("filter-width").value);
    filterLibrary[previewState.selectedFilterIndex].size.height = parseInt(document.getElementById("filter-height").value);
}

document.getElementById("add-bitmap").addEventListener("click", e => {
    // Load gif file:
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".gif";
    input.addEventListener("change", e => {
        const file = e.target.files[0];
        const gif = new Image();
        gif.src = URL.createObjectURL(file);
        gif.onload = () => {
            document.getElementById("filter-code").value += gifToBitmap(gif);
            setFilterData();
            updatePreview(document.getElementById("filter-code").value);
        };
    });
    input.click();
    input.remove();
});

function resetPreviewState() {
    previewState.bitmaps = [];
    previewState.palette = [];
    previewState.animations = [];
    previewState.animationElapsedTime = 0;
    previewState.animationStartTime = Date.now();
    previewState.painted = false;
    previewState.sent = false;
}

function gifToBitmap(image) {
    // Read the image data
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = (Math.ceil(image.width / 16)) * 16;
    canvas.height = (Math.ceil(image.height / 16)) * 16;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, image.width, image.height);

    let colors = {};
    let sortedColors = [];

    // Get the image data
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const color = (r.toString(16).padStart(2, "0") + g.toString(16).padStart(2, "0") + b.toString(16).padStart(2, "0")).toUpperCase();
        if (!(color in colors)) {
            colors[color] = Object.keys(colors).length;
            sortedColors.push(color);
        }
        pixels.push(colors[color]);
    }
    let command = "<Z><P>";
    for (let i = 0; i < sortedColors.length; i++) {
        command += `<P${sortedColors[i]}>`;
    }
    command += "<";
    let filterWidth = filterLibrary.length == 0 ? 240 : filterLibrary[filterLibrary.length - 1].size.width;
    let filterHeight = filterLibrary.length == 0 ? 240 : filterLibrary[filterLibrary.length - 1].size.height;
    command += bitmapToBCommand({ x: (filterWidth / 2) | 0, y: (filterHeight / 2) | 0, width: canvas.width, height: canvas.height, pixels })
    return command + ">";
}

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
        result += value.toString(2).padStart(4, "0");
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

function undoBlockRearrangement(indices, width, height) {
    const xBlocks = (width / 16) | 0;
    const yBlocks = (height / 16) | 0;
    const rearranged = new Array(width * height).fill(0);
    let index = 0;
    for (let bx = 0; bx < xBlocks; bx++) {
        for (let by = 0; by < yBlocks; by++) {
            for (let y = 0; y < 16; y++) {
                for (let x = 0; x < 16; x++) {
                    const destIndex = (by * 16 + y) * width + bx * 16 + x;
                    rearranged[destIndex] = indices[index++];
                }
            }
        }
    }
    return rearranged;
}

function createReplacement(key, value, scalable, hexInput) {
    function parseKey(givenKey) {
        if (givenKey.includes("+")) {
            return { key: givenKey.split("+")[0], constant: givenKey.split("+")[1], operator: (a, b) => a + b };
        } else if (givenKey.includes("-")) {
            return { key: givenKey.split("-")[0], constant: givenKey.split("-")[1], operator: (a, b) => a - b};
        } else if (givenKey.includes("*")) {
            return { key: givenKey.split("*")[0], constant: givenKey.split("*")[1], operator: (a, b) => a * b};
        } else {
            return { key: givenKey, constant: null };
        }
    };
    return { key, value, scalable, hexInput,
        computeValue: (parameter) => {
            let parsedKey = parseKey(parameter.key);
            let replacementValue = value.toString();
            if (scalable) {
                let value = parseInt(replacementValue);
                let maxVal = parameter.maxVal || 255;
                let minVal = parameter.minVal || 0;
                let scaled = (minVal + (maxVal - minVal) * value / 255) | 0;
                replacementValue = scaled.toString();
            }
            if (parsedKey.constant) {
                if (hexInput) {
                    return parsedKey.operator(parseInt(replacementValue, 16), parsedKey.constant.includes(".") ? parseFloat(parsedKey.constant) : parseInt(parsedKey.constant, 16)).toString(16).toUpperCase();
                } else {
                    return (parsedKey.operator(parseInt(replacementValue), parseFloat(parsedKey.constant)) | 0).toString();
                }
            } else {
                return replacementValue;
            }
        },
        matches: (otherKey) => {
            return key === otherKey || otherKey.startsWith(key + "+") || otherKey.startsWith(key + "-") || otherKey.startsWith(key + "*");
        },
        getParsedKey: (givenKey) => parseKey(givenKey)
    };

}

function updatePreview(code) {
    resetPreviewState();
    try {
        Array.from(document.getElementsByClassName("filter-range")).forEach(range => {
            range.disabled = true;
        });
        Array.from(document.getElementsByClassName("filter-color")).forEach(color => {
            color.disabled = true;
        });
        const W = previewState.selectedFilterIndex < filterLibrary.length ? filterLibrary[previewState.selectedFilterIndex].size.width : 240;
        const H = previewState.selectedFilterIndex < filterLibrary.length ? filterLibrary[previewState.selectedFilterIndex].size.height : 240;
        let parsed = parseCode(streamCode(code),
                [
                    createReplacement("width", W, false, false),
                    createReplacement("height", H, false, false),
                    createReplacement("cx", (W / 2) | 0, false, false),
                    createReplacement("cy", (H / 2) | 0, false, false),
                    ...([...Array(9).keys()].map(i => createReplacement(`C${i}`, document.getElementById(`filter-c${i}`).value.substring(1).toUpperCase(), false, true))),
                    ...([...Array(5).keys()].map(i => createReplacement(`P${i}`, document.getElementById(`filter-p${i}`).value.toString(), true, false))),
                ]
            );
        previewState.bitmaps = parsed.bitmaps;
        previewState.palette = parsed.palette;
        previewState.animations = parsed.animations;
        previewState.parsed = parsed;
        for (let foundParameter of parsed.foundParameters) {
            let uiElement = document.getElementById(`filter-${foundParameter.toLowerCase()}`);
            if (uiElement) {
                uiElement.disabled = false;
            }
        }
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
    if (previewState.selectedFilterIndex < filterLibrary.length) {
        filterLibrary[previewState.selectedFilterIndex].image = previewCanvas.toDataURL();
    }
    if (!previewState.painted) {
        updateFilterList();
    }
    if (!previewState.sent && previewState.parsed != null) {
        if (sendCommand(previewState.parsed.finalCode)) {
            previewState.sent = true;
            previewState.lastSent = Date.now();
        }
    }
    previewState.painted = true;
    localStorage.setItem("editing", JSON.stringify(filterLibrary));
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

function parseCode(stream, replacements) {
    let parsed = {
        bitmaps: [],
        palette: [],
        animations: [],
        finalCode: "",
        foundParameters: []
    };
    if (stream.eof()) {
        return parsed;
    }
    if (stream.peek() !== "<") {
        throw new Error("Expected < to start the code");
    }
    while(stream.peek() === "<") {
        expect(stream, "<");
        parseCommand(stream);
        expect(stream, ">")
    }
    return parsed;

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
        parsed.animations.push({ duration, components });
    }
    function parseBitmapKeyFrame(stream) {
        // BIIXXXYYYV
        expect(stream, "B");
        const index = parseHexByte(stream);
        const x = parseHexByteAndAHalf(stream);
        const y = parseHexByteAndAHalf(stream);
        const visible = readChar(stream) === "V";
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
        if (index < parsed.palette.length) {
            parsed.palette[index] = color;
        }
    }
    function parsePalette(stream) {
        expect(stream, "P");
        if (stream.peek() === ">") {
            parsed.palette.length = 0;
            return;
        }
        if (stream.peek() === "{") {
            let replacementColor = replaceParameterTemplate(parseParameterTemplate(stream), 6);
            let r = parseInt(replacementColor.substring(0, 2), 16);
            let g = parseInt(replacementColor.substring(2, 4), 16);
            let b = parseInt(replacementColor.substring(4, 6), 16);
            const color = { r, g, b };
            addPalette(color);
            return;
        }
        const r = parseHexByte(stream);
        const g = parseHexByte(stream);
        const b = parseHexByte(stream);
        const color = { r, g, b };
        addPalette(color);
    }
    function parseClear(stream) {
        expect(stream, "Z");
        parsed.bitmaps.length = 0;
        parsed.animations.length = 0;
    }
    function parseBitmap(stream) {
        expect(stream, "B");
        const x = parseHexByteAndAHalf(stream);
        const y = parseHexByteAndAHalf(stream);
        const width = parseHexByte(stream) * 16;
        const height = parseHexByte(stream) * 16;
        const bits = parseHexDigit(stream);
        const data = [];
        while (stream.peek() !== ">") {
            data.push(readChar(stream));
        }
        const binary = hexDigitsToBinary(data);
        const pixels = undoBlockRearrangement(binaryToIndices(binary, 8), width, height);
        addBitmap(x, y, width, height, pixels);
    }
    function parseTemplate(stream) {
        // <TXXXYYYC0...disks_and_sections...>
        expect(stream, "T");
        const x = parseHexByteAndAHalf(stream);
        const y = parseHexByteAndAHalf(stream);
        const s = parseHexByteAndAHalf(stream);
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
        const radius = parseHexByteAndAHalf(stream);
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
    function parseParameterTemplate(stream) {
        // There are 2 types of parameters: {C0}, {P0,3,300}
        stream.read();
        let key = "UNKNOWN";
        let maxVal = "255";
        let minVal = "0";
        while (!stream.eof() && stream.peek() !== "}") {
            key = "";
            while (!stream.eof() && stream.peek() !== "," && stream.peek() !== "}") {
                key += stream.read();
            }
            if (stream.peek() === ",") {
                stream.read();
                minVal = "";
                while (!stream.eof() && stream.peek() !== ",") {
                    minVal += stream.read();
                }
            }
            if (stream.peek() === ",") {
                stream.read();
                maxVal = "";
                while (!stream.eof() && stream.peek() !== "}") {
                    maxVal += stream.read();
                }
            }
        }
        stream.read();
        return { key, maxVal: parseInt(maxVal), minVal: parseInt(minVal) };
    }
    function replaceParameterTemplate(parameter, len) {
        let result = "0".repeat(len);
        let hexInput = false;
        for (let replacement of replacements) {
            if (replacement.matches(parameter.key)) {
                parsed.foundParameters.push(replacement.getParsedKey(parameter.key).key);
                let replacementValue = replacement.computeValue(parameter);
                let hex = replacement.hexInput ? replacementValue : parseInt(replacementValue).toString(16).toUpperCase();
                result = hex.substring(0, Math.min(len, hex.length)).padStart(len, "0");
                hexInput = replacement.hexInput;
            }
        }
        parsed.finalCode += result;
        return hexInput ? result : parseInt(result, 16);
    }
    function parseColorRef(stream) {
        if (stream.peek() === "{") {
            return replaceParameterTemplate(parseParameterTemplate(stream), 2);
        }
        return parseHexByte(stream);
    }
    function parseHexDigit(stream) {
        if (stream.peek() === "{") {
            return replaceParameterTemplate(parseParameterTemplate(stream), 1);
        }
        const char = stream.read();
        parsed.finalCode += char;
        if (char >= "0" && char <= "9") {
            return char.charCodeAt(0) - "0".charCodeAt(0);
        } else if (char >= "A" && char <= "F") {
            return char.charCodeAt(0) - "A".charCodeAt(0) + 10;
        } else {
            throw new Error(`Invalid hex character: ${char}`);
        }
    }
    function parseHexByte(stream) {
        if (stream.peek() === "{") {
            return replaceParameterTemplate(parseParameterTemplate(stream), 2);
        }
        return parse2DigitNumber(stream);
    }
    function parse2DigitNumber(stream) {
        const high = parseHexDigit(stream);
        const low = parseHexDigit(stream);
        return high * 16 + low;
    }
    function parseHexByteAndAHalf(stream) {
        if (stream.peek() === "{") {
            return replaceParameterTemplate(parseParameterTemplate(stream), 3);
        }
        return parse3DigitNumber(stream);
    }
    function parse3DigitNumber(stream) {
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
        parsed.finalCode += token;
    }
    function readChar(stream) {
        parsed.finalCode += stream.peek();
        return stream.read();
    }
    function addPalette(color) {
        parsed.palette.push(color);
    }
    function addBitmap(x, y, width, height, pixels) {
       parsed.bitmaps.push({ x, y, width, height, pixels, visible: true });
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
        addBitmap(x, y, w, h, bitmap);
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

