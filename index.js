function lerp(a, b, t) {
    return a + (b - a) * t;
}

function randomBetween(min = 0, max = 1) {
    return Math.random() * (max - min) + min;
}

const randomAngle = () => randomBetween(0, 2 * Math.PI);

class Color {
    constructor(r, g, b, a) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }

    toRgba() {
        return `rgba(${this.r * 255}, ${this.g * 255}, ${this.b * 255}, ${this.a})`;
    }

    withAlpha(a) {
        return new Color(this.r, this.g, this.b, a);
    }

    grayScale(t = 1.0) {
        let x = (this.r + this.g + this.b) / 3;
        return new Color(
            lerp(this.r, x, t),
            lerp(this.g, x, t),
            lerp(this.b, x, t),
            this.a);
    }

    static hex(hexcolor) {
        let matches =
            hexcolor.match(/#([0-9a-z]{2})([0-9a-z]{2})([0-9a-z]{2})/i);
        if (matches) {
            let [, r, g, b] = matches;
            return new Color(parseInt(r, 16) / 255.0,
                             parseInt(g, 16) / 255.0,
                             parseInt(b, 16) / 255.0,
                             1.0);
        } else {
            throw new Error(`Could not parse ${hexcolor} as color`);
        }
    }
}

class V2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    add(that) {
        return new V2(this.x + that.x, this.y + that.y);
    }

    sub(that) {
        return new V2(this.x - that.x, this.y - that.y);
    }

    scale(s) {
        return new V2(this.x * s, this.y * s);
    }

    len() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    normalize() {
        const n = this.len();
        return n === 0 ? new V2(0, 0) : new V2(this.x / n, this.y / n);
    }

    dist(that) {
        return this.sub(that).len();
    }

    static polar(mag, dir) {
        return new V2(Math.cos(dir) * mag, Math.sin(dir) * mag);
    }
}

function shaderTypeToString(gl, shaderType) {
    switch (shaderType) {
    case gl.VERTEX_SHADER: return 'Vertex';
    case gl.FRAGMENT_SHADER: return 'Fragment';
    default: return shaderType;
    }
}

function compileShaderSource(gl, source, shaderType) {
    const shader = gl.createShader(shaderType);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`Could not compile ${this.shaderTypeToString(shaderType)} shader: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
}

function linkShaderProgram(gl, shaders, vertexAttribs) {
    const program = gl.createProgram();
    for (let shader of shaders) {
        gl.attachShader(program, shader);
    }

    for (let vertexName in vertexAttribs) {
        gl.bindAttribLocation(program, vertexAttribs[vertexName], vertexName);
    }

    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`Could not link shader program: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
}

class BitmapFontProgram {
    vertexShaderSource = `#version 100

precision mediump float;

attribute vec2 meshPosition;
attribute vec2 letterSlot;

uniform vec2 resolution;
uniform float messageScale;
uniform vec2 messagePosition;
uniform float letterCount;

varying vec2 uv;

void main() {
    float letterCode = letterSlot.x;
    float letterCol = letterSlot.y;

    vec2 meshPositionUV = (meshPosition + vec2(1.0, 1.0)) / 2.0;
    vec2 screenPosition = 
        meshPositionUV * vec2(float(${FONT_CHAR_WIDTH}), float(${FONT_CHAR_HEIGHT})) * messageScale +
        messagePosition +
        vec2(float(${FONT_CHAR_WIDTH}) * messageScale * letterCol, 0.0);

    gl_Position = vec4(2.0 * screenPosition / resolution, 0.0, 1.0);

    float charIndex = letterCode - 32.0;
    float charU = (floor(mod(charIndex, float(${FONT_SHEET_COLS}))) + meshPositionUV.x) * float(${FONT_CHAR_WIDTH}) / float(${FONT_SHEET_WIDTH});
    float charV = (floor(charIndex / float(${FONT_SHEET_COLS})) + (1.0 - meshPositionUV.y)) * float(${FONT_CHAR_HEIGHT}) / float(${FONT_SHEET_HEIGHT});
    uv = vec2(charU, charV);
}
`;

    fragmentShaderSource = `#version 100

precision mediump float;

uniform sampler2D font;
uniform vec4 messageColor;

varying vec2 uv;

void main() {
    vec4 tex = texture2D(font, uv);
    gl_FragColor = tex * vec4(messageColor.r, messageColor.g, messageColor.b, messageColor.a * tex.r);
}
`;

    constructor(gl, ext, vertexAttribs) {
        this.gl = gl;
        this.ext = ext;

        let vertexShader = compileShaderSource(gl, this.vertexShaderSource, gl.VERTEX_SHADER);
        let fragmentShader = compileShaderSource(gl, this.fragmentShaderSource, gl.FRAGMENT_SHADER);
        this.program = linkShaderProgram(gl, [vertexShader, fragmentShader], vertexAttribs);
        gl.useProgram(this.program);

        this.resolutionUniform = gl.getUniformLocation(this.program, 'resolution');
        this.messageScaleUniform = gl.getUniformLocation(this.program, 'messageScale');
        this.messageColorUniform = gl.getUniformLocation(this.program, 'messageColor');
        gl.uniform4f(this.messageColorUniform, 1.0, 1.0, 1.0, 1.0);
        this.timeUniform = gl.getUniformLocation(this.program, 'time');
        this.letterCountUniform = gl.getUniformLocation(this.program, 'letterCount');
        this.messagePositionUniform = gl.getUniformLocation(this.program, 'messagePosition');
    }

    use() {
        this.gl.useProgram(this.program);
    }

    setViewport(width, height) {
        const scale = Math.min(
            width / DEFAULT_RESOLUTION.w,
            height / DEFAULT_RESOLUTION.h,
        );

        this.unitsPerPixel = 1 / scale;
        this.gl.uniform2f(this.resolutionUniform, width, height);
    }

    setTimestamp(timestamp) {
        this.gl.uniform1f(this.timeUniform, timestamp);
    }

    setColor(color) {
        this.gl.uniform4f(this.messageColorUniform, color.r, color.g, color.b, color.a);
    }

    setMessagePosition(x, y) {
        this.gl.uniform2f(this.messagePositionUniform, x, y);
    }

    setMessageScale(scale) {
        this.gl.uniform1f(this.messageScaleUniform, scale);
    }

    draw(letterCount) {
        this.gl.uniform1f(this.letterCountUniform, letterCount);
        this.ext.drawArraysInstancedANGLE(this.gl.TRIANGLES, 0, TRIANGLE_PAIR * TRIANGLE_VERTICIES, letterCount);
    }
}

class BackgroundProgram {
    vertexShaderSource = `#version 100
precision mediump float;

attribute vec2 meshPosition;

varying vec2 position;

void main() {
    gl_Position = vec4(meshPosition, 0.0, 1.0);
    position = vec2(meshPosition.x, -meshPosition.y);
}
`

    fragmentShaderSource = `#version 100
precision mediump float;

uniform vec2 resolution;
uniform vec2 cameraPosition;
uniform float time;

varying vec2 position;

void main() {
    float gridSize = 2000.0;
    float radius = gridSize * 0.4;

    float scale = min(resolution.x / float(${DEFAULT_RESOLUTION.w}), resolution.y / float(${DEFAULT_RESOLUTION.h}));
    vec2 coord = (position * resolution * 0.5 / scale + cameraPosition);
    vec2 cell = floor(coord / gridSize);
    vec2 center = cell * gridSize + vec2(gridSize * 0.5);

    if (length(center - coord) < radius) {
        float value = (sin(cell.x + cell.y + time) + 1.0) / 2.0 * 0.1;
        gl_FragColor = vec4(value, value, value, 1.0);
    } else {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
}
`

    constructor(gl, vertexAttribs) {
        this.gl = gl;

        let vertexShader = compileShaderSource(gl, this.vertexShaderSource, gl.VERTEX_SHADER);
        let fragmentShader = compileShaderSource(gl, this.fragmentShaderSource, gl.FRAGMENT_SHADER);
        this.program = linkShaderProgram(gl, [vertexShader, fragmentShader], vertexAttribs);
        gl.useProgram(this.program);

        this.resolutionUniform = gl.getUniformLocation(this.program, 'resolution');
        this.cameraPositionUniform = gl.getUniformLocation(this.program, 'cameraPosition');
        this.timeUniform = gl.getUniformLocation(this.program, 'time');
    }

    use() {
        this.gl.useProgram(this.program);
    }

    setViewport(width, height) {
        const scale = Math.min(
            width / DEFAULT_RESOLUTION.w,
            height / DEFAULT_RESOLUTION.h,
        );

        this.unitsPerPixel = 1 / scale;
        this.gl.uniform2f(this.resolutionUniform, width, height);
    }

    setCameraPosition(pos) {
        this.gl.uniform2f(this.cameraPositionUniform, pos.x, pos.y);
    }

    setTimestamp(timestamp) {
        this.gl.uniform1f(this.timeUniform, timestamp);
    }

    draw() {
        this.gl.drawArrays(this.gl.TRIANGLES, 0, TRIANGLE_PAIR * TRIANGLE_VERTICIES);
    }
}

class CirclesProgram {
    vertexShaderSource = `#version 100
precision mediump float;

uniform vec2 resolution;
uniform vec2 cameraPosition;

attribute vec2 meshPosition;

attribute vec2 circleCenter;
attribute float circleRadius;
attribute vec4 circleColor;

varying vec4 vertexColor;
varying vec2 vertexUV;

vec2 camera_projection(vec2 position) {
    float scale = min(resolution.x / float(${DEFAULT_RESOLUTION.w}), resolution.y / float(${DEFAULT_RESOLUTION.h}));
    vec2 result = 2.0 * scale * (position - cameraPosition) / resolution;
    return vec2(result.x, -result.y);
}

void main() {
    gl_Position = vec4(camera_projection(meshPosition * circleRadius + circleCenter), 0.0, 1.0);
    vertexColor = circleColor;
    vertexUV = meshPosition;
}
`;

    fragmentShaderSource =`#version 100
precision mediump float;

uniform float grayness;

varying vec4 vertexColor;
varying vec2 vertexUV;

vec4 grayScale(vec4 color, float t) {
    float v = (color.x + color.y + color.z) / 3.0;
    return vec4(
        mix(color.x, v, t),
        mix(color.y, v, t),
        mix(color.z, v, t),
        color.w);
}

void main() {
    vec4 color = vertexColor;
    gl_FragColor = length(vertexUV) < 1.0 ? grayScale(color, grayness) : vec4(0.0);
}
`;

    constructor(gl, ext, vertexAttribs) {
        this.gl = gl;
        this.ext = ext;

        let vertexShader = compileShaderSource(gl, this.vertexShaderSource, gl.VERTEX_SHADER);
        let fragmentShader = compileShaderSource(gl, this.fragmentShaderSource, gl.FRAGMENT_SHADER);
        this.program = linkShaderProgram(gl, [vertexShader, fragmentShader], vertexAttribs);
        gl.useProgram(this.program);

        this.resolutionUniform = gl.getUniformLocation(this.program, 'resolution');
        this.cameraPositionUniform = gl.getUniformLocation(this.program, 'cameraPosition');
        this.graynessUniform = gl.getUniformLocation(this.program, 'grayness');

    }

    use() {
        this.gl.useProgram(this.program);
    }

    // TODO: Rename Renderer(WebGL|2D).setViewport() to setResolution()
    setViewport(width, height) {
        this.gl.uniform2f(this.resolutionUniform, width, height);
    }

    setCameraPosition(pos) {
        this.gl.uniform2f(this.cameraPositionUniform, pos.x, pos.y);
    }

    setGrayness(grayness) {
        this.gl.uniform1f(this.graynessUniform, grayness);
    }

    draw(circlesCount) {
        this.ext.drawArraysInstancedANGLE(this.gl.TRIANGLES, 0, TRIANGLE_PAIR * TRIANGLE_VERTICIES, circlesCount);
    }
}

class RendererWebGL {
    cameraPos = new V2(0, 0);
    cameraVel = new V2(0, 0);
    resolution = new V2(0, 0);
    unitsPerPixel = 1.0;

    vertexAttribs = {
        "meshPosition": 0,
        "circleCenter": 1,
        "circleRadius": 2,
        "circleColor": 3,
        "letterSlot": 4,
    };

    constructor(gl, ext) {
        this.gl = gl;
        this.ext = ext;
        this.circlesCount = 0;
        this.messages = [];

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Bitmap Font
        {
            const bitmapFontImage = document.getElementById('bitmap-font');
            let bitmapFontTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, bitmapFontTexture);
            gl.texImage2D(
                gl.TEXTURE_2D,    // target
                0,                // level
                gl.RGBA,          // internalFormat
                gl.RGBA,          // srcFormat
                gl.UNSIGNED_BYTE, // srcType
                bitmapFontImage   // image
            );

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }

        // Mesh Position
        {
            this.meshPositionBufferData = new Float32Array(TRIANGLE_PAIR * TRIANGLE_VERTICIES * VEC2_COUNT);
            for (let triangle = 0; triangle < TRIANGLE_PAIR; ++triangle) {
                for (let vertex = 0; vertex < TRIANGLE_VERTICIES; ++vertex) {
                    const quad = triangle + vertex;
                    const index =
                          triangle * TRIANGLE_VERTICIES * VEC2_COUNT +
                          vertex * VEC2_COUNT;
                    this.meshPositionBufferData[index + VEC2_X] = (2 * (quad & 1) - 1);
                    this.meshPositionBufferData[index + VEC2_Y] = (2 * ((quad >> 1) & 1) - 1);
                }
            }

            this.meshPositionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.meshPositionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.meshPositionBufferData, gl.STATIC_DRAW);

            const meshPositionAttrib = this.vertexAttribs['meshPosition'];
            gl.vertexAttribPointer(
                meshPositionAttrib,
                VEC2_COUNT,
                gl.FLOAT,
                false,
                0,
                0);
            gl.enableVertexAttribArray(meshPositionAttrib);
        }

        // Circle Center
        {
            this.circleCenterBufferData = new Float32Array(VEC2_COUNT * CIRCLE_BATCH_CAPACITY);
            this.circleCenterBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.circleCenterBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.circleCenterBufferData, gl.DYNAMIC_DRAW);

            const circleCenterAttrib = this.vertexAttribs['circleCenter'];
            gl.vertexAttribPointer(
                circleCenterAttrib,
                VEC2_COUNT,
                gl.FLOAT,
                false,
                0,
                0);
            gl.enableVertexAttribArray(circleCenterAttrib);
            ext.vertexAttribDivisorANGLE(circleCenterAttrib, 1);
        }

        // Circle Radius
        {
            this.circleRadiusBufferData = new Float32Array(CIRCLE_BATCH_CAPACITY);
            this.circleRadiusBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.circleRadiusBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.circleRadiusBufferData, gl.DYNAMIC_DRAW);

            const circleRadiusAttrib = this.vertexAttribs['circleRadius'];
            gl.vertexAttribPointer(
                circleRadiusAttrib,
                1,
                gl.FLOAT,
                false,
                0,
                0);
            gl.enableVertexAttribArray(circleRadiusAttrib);
            ext.vertexAttribDivisorANGLE(circleRadiusAttrib, 1);
        }

        // Circle Color
        {
            this.circleColorBufferData = new Float32Array(RGBA_COUNT * CIRCLE_BATCH_CAPACITY);
            this.circleColorBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.circleColorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.circleColorBufferData, gl.DYNAMIC_DRAW);

            const circleColorAttrib = this.vertexAttribs['circleColor'];
            gl.vertexAttribPointer(
                circleColorAttrib,
                RGBA_COUNT,
                gl.FLOAT,
                false,
                0,
                0);
            gl.enableVertexAttribArray(circleColorAttrib);
            ext.vertexAttribDivisorANGLE(circleColorAttrib, 1);
        }


        // Letter Slot
        {
            this.letterSlotBufferData = new Float32Array(LETTER_SLOTS_CAPACITY * VEC2_COUNT);

            this.letterSlotBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.letterSlotBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.letterSlotBufferData, gl.DYNAMIC_DRAW);
            
            const letterSlotAttrib = this.vertexAttribs['letterSlot'];
            gl.vertexAttribPointer(
                letterSlotAttrib,
                LETTER_SLOT_COUNT,
                gl.FLOAT,
                false,
                0,
                0);
            gl.enableVertexAttribArray(letterSlotAttrib);
            ext.vertexAttribDivisorANGLE(letterSlotAttrib, 1);
        }

        this.backgroundProgram = new BackgroundProgram(gl, this.vertexAttribs);
        this.circlesProgram = new CirclesProgram(gl, ext, this.vertexAttribs);
        this.bitmapFontProgram = new BitmapFontProgram(gl, ext, this.vertexAttribs);
    }

    // RENDERER INTERFACE //////////////////////////////
    setTimestamp(timestamp) {
        this.timestamp = timestamp;
    }

    setViewport(width, height) {
        this.gl.viewport(0, 0, width, height);
        this.resolution.x = width;
        this.resolution.y = height;

        const scale = Math.min(
            width / DEFAULT_RESOLUTION.w,
            height / DEFAULT_RESOLUTION.h,
        );

        this.unitsPerPixel = 1 / scale;
    }

    setTarget(target) {
        this.cameraVel = target.sub(this.cameraPos);
    }

    update(dt) {
        this.cameraPos = this.cameraPos.add(this.cameraVel.scale(dt));
    }

    present() {
        // Update All dynamic buffers
        {
            // TODO: bufferSubData should probably use subview of this Float32Array if that's even possible
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.circleCenterBuffer);
            this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, this.circleCenterBufferData);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.circleRadiusBuffer);
            this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, this.circleRadiusBufferData);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.circleColorBuffer);
            this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, this.circleColorBufferData);
        }

        // Call the Background Program
        {
            this.backgroundProgram.use();
            this.backgroundProgram.setCameraPosition(this.cameraPos);
            this.backgroundProgram.setViewport(this.resolution.x, this.resolution.y);
            this.backgroundProgram.setTimestamp(this.timestamp);
            this.backgroundProgram.draw(this.circlesCount);
        }

        // Call the Circles Program
        {
            this.circlesProgram.use();
            this.circlesProgram.setCameraPosition(this.cameraPos);
            this.circlesProgram.setViewport(this.resolution.x, this.resolution.y);
            this.circlesProgram.setGrayness(this.grayness);
            this.circlesProgram.draw(this.circlesCount);
        }

        // Call the Bitmap Font Program
        {
            this.bitmapFontProgram.use();
            this.bitmapFontProgram.setViewport(this.resolution.x, this.resolution.y);
            this.bitmapFontProgram.setTimestamp(this.timestamp);

            const scale = FONT_MESSAGE_SCALE * (1.0 / this.unitsPerPixel);
            this.bitmapFontProgram.setMessageScale(scale);
            for (let [text, color] of this.messages) {
                this.bitmapFontProgram.setColor(color);

                const lines = text.split('\n');
                const message_height = lines.length * FONT_CHAR_HEIGHT * scale;
                for (let row = 0; row < lines.length; ++row) {
                    const line = lines[row];

                    this.bitmapFontProgram.setMessagePosition(
                        line.length * FONT_CHAR_WIDTH * scale * -0.5,
                        message_height * 0.5 - (row + 1) * FONT_CHAR_HEIGHT * scale);

                    for (let i = 0; i < line.length && i < this.letterSlotBufferData.length; ++i) {
                        this.letterSlotBufferData[i * LETTER_SLOT_COUNT + LETTER_SLOT_CODE] = line.charCodeAt(i);
                        this.letterSlotBufferData[i * LETTER_SLOT_COUNT + LETTER_SLOT_COL] = i;
                    }
                    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.letterSlotBuffer);
                    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, this.letterSlotBufferData);

                    this.bitmapFontProgram.draw(line.length);
                }
            }
        }
    }

    clear() {
        this.circlesCount = 0;
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.messages.length = 0;
    }

    background() {
        // TODO: RendererWebGL.background() is not implemented
    }

    fillCircle(center, radius, color) {
        if (this.circlesCount < CIRCLE_BATCH_CAPACITY) {
            this.circleCenterBufferData[this.circlesCount * VEC2_COUNT + VEC2_X] = center.x;
            this.circleCenterBufferData[this.circlesCount * VEC2_COUNT + VEC2_Y] = center.y;

            this.circleRadiusBufferData[this.circlesCount] = radius;

            this.circleColorBufferData[this.circlesCount * RGBA_COUNT + RGBA_R] = color.r;
            this.circleColorBufferData[this.circlesCount * RGBA_COUNT + RGBA_G] = color.g;
            this.circleColorBufferData[this.circlesCount * RGBA_COUNT + RGBA_B] = color.b;
            this.circleColorBufferData[this.circlesCount * RGBA_COUNT + RGBA_A] = color.a;

            this.circlesCount += 1;
        }
    }

    fillMessage(text, color) {
        this.messages.push([text, color]);
    }

    screenToWorld(point) {
        return point
            .sub(this.resolution.scale(0.5))
            .scale(this.unitsPerPixel)
            .add(this.cameraPos);
    }

    ////////////////////////////////////////////////////////////
}

class Renderer2D {
    cameraPos = new V2(0, 0);
    cameraVel = new V2(0, 0);
    grayness = 0.0;
    unitsPerPixel = 1.0;

    constructor(context2d) {
        this.context2d = context2d;
    }

    update(dt) {
        this.cameraPos = this.cameraPos.add(this.cameraVel.scale(dt));
    }

    width() {
        return this.context2d.canvas.width * this.unitsPerPixel;
    }

    height() {
        return this.context2d.canvas.height * this.unitsPerPixel;
    }

    getScreenWorldBounds() {
        let topLeft = this.screenToWorld(new V2(0, 0));
        let bottomRight = this.screenToWorld(new V2(this.context2d.canvas.width, this.context2d.canvas.height));
        return [topLeft, bottomRight];
    }

    screenToWorld(point) {
        const width = this.context2d.canvas.width;
        const height = this.context2d.canvas.height;
        return point
            .sub(new V2(width / 2, height / 2))
            .scale(this.unitsPerPixel)
            .add(this.cameraPos);
    }

    worldToCamera(point) {
        const width = this.width();
        const height = this.height();
        return point.sub(this.cameraPos).add(new V2(width / 2, height / 2));
    }

    clear() {
        const width = this.width();
        const height = this.height();
        this.context2d.clearRect(0, 0, width, height);
    }

    setTarget(target) {
        this.cameraVel = target.sub(this.cameraPos);
    }

    fillCircle(center, radius, color) {
        const screenCenter = this.worldToCamera(center);
        this.context2d.fillStyle = color.grayScale(this.grayness).toRgba();
        this.context2d.beginPath();
        this.context2d.arc(screenCenter.x, screenCenter.y, radius, 0, 2 * Math.PI, false);
        this.context2d.fill();
    }

    fillRect(x, y, w, h, color) {
        const screenPos = this.worldToCamera(new V2(x, y));
        this.context2d.fillStyle = color.grayScale(this.grayness).toRgba();
        this.context2d.fillRect(screenPos.x, screenPos.y, w, h);
    }

    fillMessage(text, color) {
        const width = this.width();
        const height = this.height();

        const FONT_SIZE = 69;
        const LINE_PADDING = 69;
        this.context2d.fillStyle = color.toRgba();
        this.context2d.font = `${FONT_SIZE}px LexendMega`;
        this.context2d.textAlign = "center";
        this.context2d.textBaseline = "middle";
        const lines = text.split("\n");
        const MESSAGE_HEIGTH = (FONT_SIZE + LINE_PADDING) * (lines.length - 1);
        for (let i = 0; i < lines.length; ++i) {
            this.context2d.fillText(lines[i], width / 2, (height - MESSAGE_HEIGTH) / 2 + (FONT_SIZE + LINE_PADDING) * i);
        }
    }

    drawLine(points, color) {
        this.context2d.beginPath();
        for (let i = 0; i < points.length; ++i) {
            let screenPoint = this.worldToCamera(points[i]);
            if (i == 0) this.context2d.moveTo(screenPoint.x, screenPoint.y);
            else this.context2d.lineTo(screenPoint.x, screenPoint.y);
        }
        this.context2d.strokeStyle = color.toRgba();
        this.context2d.stroke();
    }

    setViewport(width, height) {
        const IDENTITY = new DOMMatrix();

        const scale = Math.min(
            width / DEFAULT_RESOLUTION.w,
            height / DEFAULT_RESOLUTION.h,
        );

        this.unitsPerPixel = 1 / scale;

        this.context2d.setTransform(IDENTITY);
        this.context2d.scale(scale, scale);
    }

    present() {
        // Nothing to do. Everything is already presented by the 2D HTML canvas
    }

    setTimestamp(timestamp) {
        // Nothing to do. We don't use absolute value of the time to animate anything in here.
    }

    background() {
        let bounds = this.getScreenWorldBounds();
        let gridBoundsXMin = Math.floor(bounds[0].x / BACKGROUND_CELL_WIDTH);
        let gridBoundsXMax = Math.floor(bounds[1].x / BACKGROUND_CELL_WIDTH);
        let gridBoundsYMin = Math.floor(bounds[0].y / BACKGROUND_CELL_HEIGHT);
        let gridBoundsYMax = Math.floor(bounds[1].y / BACKGROUND_CELL_HEIGHT);

        for (let cellX = gridBoundsXMin; cellX <= gridBoundsXMax + 1; ++cellX) {
            for (let cellY = gridBoundsYMin; cellY <= gridBoundsYMax; ++cellY) {
                let offset = new V2(
                    cellX * BACKGROUND_CELL_WIDTH,
                    (cellY + (cellX % 2 == 0 ? 0.5 : 0)) * BACKGROUND_CELL_HEIGHT,
                );
                let points = BACKGROUND_CELL_POINTS.map(p => p.add(offset));
                this.drawLine(points, BACKGROUND_LINE_COLOR);
            }
        }
    }
}

const TRIANGLE_PAIR = 2;
const TRIANGLE_VERTICIES = 3;
const QUAD_VERTICIES = 4;
const VEC2_COUNT = 2;
const VEC2_X = 0;
const VEC2_Y = 1;
const RGBA_COUNT = 4;
const RGBA_R = 0;
const RGBA_G = 1;
const RGBA_B = 2;
const RGBA_A = 3;
const DEFAULT_RESOLUTION = {w: 3840, h: 2160};
const PLAYER_COLOR = Color.hex("#f43841");
const PLAYER_SPEED = 1000;
const PLAYER_RADIUS = 69;
const PLAYER_MAX_HEALTH = 100;
const PLAYER_SHOOT_COOLDOWN = 0.25 / 2.0;
const PLAYER_TRAIL_RATE = 3.0;
const TUTORIAL_POPUP_SPEED = 1.7;
const BULLET_RADIUS = 42;
const BULLET_SPEED = 2000;
const BULLET_LIFETIME = 5.0;
const ENEMY_SPEED = PLAYER_SPEED / 3;
const ENEMY_RADIUS = PLAYER_RADIUS;
const ENEMY_SPAWN_ANIMATION_SPEED = ENEMY_RADIUS * 8;
const ENEMY_COLOR = Color.hex("#9e95c7");
const ENEMY_SPAWN_COOLDOWN = 1.0;
const ENEMY_SPAWN_GROWTH = 1.01;
const ENEMY_SPAWN_DISTANCE = 1500.0;
const ENEMY_DESPAWN_DISTANCE = ENEMY_SPAWN_DISTANCE * 2;
const ENEMY_DAMAGE = PLAYER_MAX_HEALTH / 5;
const ENEMY_KILL_HEAL = PLAYER_MAX_HEALTH / 10;
const ENEMY_KILL_SCORE = 100;
const ENEMY_TRAIL_RATE = 2.0;
const PARTICLES_COUNT_RANGE = [0, 50];
const PARTICLE_RADIUS_RANGE = [10.0, 20.0];
const PARTICLE_MAG_RANGE = [0, BULLET_SPEED];
const PARTICLE_MAX_LIFETIME = 1.0;
const PARTICLE_LIFETIME_RANGE = [0, PARTICLE_MAX_LIFETIME];
const MESSAGE_COLOR = Color.hex("#ffffff");
const TRAIL_COOLDOWN = 1 / 60;
const BACKGROUND_CELL_RADIUS = 120;
const BACKGROUND_LINE_COLOR = Color.hex("#ffffff").withAlpha(0.5);
const BACKGROUND_CELL_WIDTH = 1.5 * BACKGROUND_CELL_RADIUS;
const BACKGROUND_CELL_HEIGHT = Math.sqrt(3) * BACKGROUND_CELL_RADIUS;
const BACKGROUND_CELL_POINTS = (() => {
    let points = [];
    for (let i = 0; i < 4; ++i) {
        let angle = 2 * Math.PI * i / 6;
        points.push(new V2(Math.cos(angle), Math.sin(angle)).scale(BACKGROUND_CELL_RADIUS));
    }
    return points;
})();
const CIRCLE_BATCH_CAPACITY = 1024 * 10;
const LETTER_SLOTS_CAPACITY = 1024;
const LETTER_SLOT_COUNT = VEC2_COUNT;
const LETTER_SLOT_CODE = 0;
const LETTER_SLOT_COL = 1;
const FONT_SHEET_WIDTH = 128;
const FONT_SHEET_HEIGHT = 64;
const FONT_SHEET_COLS = 18;
const FONT_SHEET_ROWS = 7;
const FONT_CHAR_WIDTH = Math.floor(FONT_SHEET_WIDTH / FONT_SHEET_COLS);
const FONT_CHAR_HEIGHT = Math.floor(FONT_SHEET_HEIGHT / FONT_SHEET_ROWS);
const FONT_MESSAGE_SCALE = 10.0;

const directionMap = {
    'KeyS': new V2(0, 1.0),
    'KeyW': new V2(0, -1.0),
    'KeyA': new V2(-1.0, 0),
    'KeyD': new V2(1.0, 0)
};

class Particle {
    constructor(pos, vel, lifetime, radius, color) {
        this.pos = pos;
        this.vel = vel;
        this.lifetime = lifetime;
        this.radius = radius;
        this.color = color;
    }

    render(renderer) {
        const a = this.lifetime / PARTICLE_MAX_LIFETIME;
        renderer.fillCircle(this.pos, this.radius,
                            this.color.withAlpha(a));
    }

    update(dt) {
        this.pos = this.pos.add(this.vel.scale(dt));
        this.lifetime -= dt;
    }
}

// TODO(#2): burst particle in a particular direction;
function particleBurst(particles, center, color) {
    const N = randomBetween(...PARTICLES_COUNT_RANGE);
    for (let i = 0; i < N; ++i) {
        particles.push(new Particle(
            center,
            V2.polar(randomBetween(...PARTICLE_MAG_RANGE), randomAngle()),
            randomBetween(...PARTICLE_LIFETIME_RANGE),
            randomBetween(...PARTICLE_RADIUS_RANGE),
            color));
    }
}

class Enemy {
    trail = new Trail(ENEMY_RADIUS, ENEMY_COLOR, ENEMY_TRAIL_RATE);

    constructor(pos) {
        this.pos = pos;
        this.ded = false;
        this.radius = 0.0;
    }

    update(dt, followPos) {
        let vel = followPos
            .sub(this.pos)
            .normalize()
            .scale(ENEMY_SPEED * dt);
        this.trail.push(this.pos);
        this.pos = this.pos.add(vel);
        this.trail.update(dt);

        if (this.radius < ENEMY_RADIUS) {
            this.radius += ENEMY_SPAWN_ANIMATION_SPEED * dt;
        } else {
            this.radius = ENEMY_RADIUS;
        }
    }

    render(renderer) {
        this.trail.render(renderer);
        renderer.fillCircle(this.pos, this.radius, ENEMY_COLOR);
    }
}

class Bullet {
    constructor(pos, vel) {
        this.pos = pos;
        this.vel = vel;
        this.lifetime = BULLET_LIFETIME;
    }

    update(dt) {
        this.pos = this.pos.add(this.vel.scale(dt));
        this.lifetime -= dt;
    }

    render(renderer) {
        renderer.fillCircle(this.pos, BULLET_RADIUS, PLAYER_COLOR);
    }
}

class TutorialPopup {
    constructor(text) {
        this.alpha = 0.0;
        this.dalpha = 0.0;
        this.text = text;
        this.onFadedOut = undefined;
        this.onFadedIn = undefined;
    }

    update(dt) {
        this.alpha += this.dalpha * dt;

        if (this.dalpha < 0.0 && this.alpha <= 0.0) {
            this.dalpha = 0.0;
            this.alpha = 0.0;

            this.onFadedOut?.();
        } else if (this.dalpha > 0.0 && this.alpha >= 1.0) {
            this.dalpha = 0.0;
            this.alpha = 1.0;

            this.onFadedIn?.();
        }
    }

    render(renderer) {
        renderer.fillMessage(this.text, MESSAGE_COLOR.withAlpha(this.alpha));
    }

    fadeIn() {
        this.dalpha = TUTORIAL_POPUP_SPEED;
    }

    fadeOut() {
        this.dalpha = -TUTORIAL_POPUP_SPEED;
    }
}

const TutorialState = Object.freeze({
    "LearningMovement": 0,
    "LearningShooting": 1,
    "Finished": 2,
});

const TutorialMessages = Object.freeze([
    "WASD to move",
    "Left Mouse Click to shoot",
    ""
]);

const LOCAL_STORAGE_TUTORIAL = "tutorial";

class Tutorial {
    constructor() {
        const state = parseInt(window.localStorage.getItem(LOCAL_STORAGE_TUTORIAL));
        this.state = !isNaN(state) && 0 <= state && state < TutorialMessages.length ? state : 0;
        this.popup = new TutorialPopup(TutorialMessages[this.state]);
        this.popup.fadeIn();
        this.popup.onFadedOut = () => {
            this.popup.text = TutorialMessages[this.state];
            this.popup.fadeIn();
        };
    }

    update(dt) {
        this.popup.update(dt);
    }

    render(renderer) {
        this.popup.render(renderer);
    }

    playerMoved() {
        if (this.state == TutorialState.LearningMovement) {
            this.popup.fadeOut();
            this.state += 1;
            window.localStorage.setItem(LOCAL_STORAGE_TUTORIAL, this.state);
        }
    }

    playerShot() {
        if (this.state == TutorialState.LearningShooting) {
            this.popup.fadeOut();
            this.state += 1;
            window.localStorage.setItem(LOCAL_STORAGE_TUTORIAL, this.state);
        }
    }
}

class Trail {
    trail = [];
    cooldown = 0;
    disabled = false;

    constructor(radius, color, rate) {
        this.radius = radius;
        this.color = color;
        this.rate = rate;
    }

    render(renderer) {
        const n = this.trail.length;
        for (let i = 0; i < n; ++i) {
            renderer.fillCircle(
                this.trail[i].pos,
                this.radius * this.trail[i].a,
                this.color.withAlpha(0.2 * this.trail[i].a));
        }
    }

    update(dt) {
        for (let dot of this.trail) {
            dot.a -= this.rate * dt;
        }

        while (this.trail.length > 0 && this.trail[0].a <= 0.0) {
            this.trail.shift();
        }

        this.cooldown -= dt;
    }

    push(pos) {
        if (!this.disabled && this.cooldown <= 0)  {
            this.trail.push({
                pos: pos,
                a: 1.0
            });
            this.cooldown = TRAIL_COOLDOWN;
        }
    }
}

class Player {
    health = PLAYER_MAX_HEALTH;
    shooting = false;
    lastShoot = 0.0;
    trail = new Trail(PLAYER_RADIUS, PLAYER_COLOR, PLAYER_TRAIL_RATE);

    constructor(pos) {
        this.pos = pos;
        this.accuracy = 0;
        this.shootCount = window.localStorage.getItem(LOCAL_STORAGE_TUTORIAL) == TutorialState.Finished ? 0 : -1;
    }

    render(renderer) {
        this.trail.render(renderer);

        if (this.health > 0.0) {
            renderer.fillCircle(this.pos, PLAYER_RADIUS, PLAYER_COLOR);
        }
    }

    update(dt, vel) {
        this.trail.push(this.pos);
        this.pos = this.pos.add(vel.scale(dt));
        this.trail.update(dt);
    }

    shootAt(target) {
        this.shootCount += 1;
        this.lastShoot = performance.now() * 0.001;
        const bulletDir = target
              .sub(this.pos)
              .normalize();
        const bulletVel = bulletDir.scale(BULLET_SPEED);
        const bulletPos = this
              .pos
              .add(bulletDir.scale(PLAYER_RADIUS + BULLET_RADIUS));

        return new Bullet(bulletPos, bulletVel);
    }

    damage(value) {
        this.health = Math.max(this.health - value, 0.0);
    }

    heal(value) {
        if (this.health > 0.0) {
            this.health = Math.min(this.health + value, PLAYER_MAX_HEALTH);
        }
    }
}

// TODO(#8): the game stops when you unfocus the browser
// TODO(#9): some sort of inertia during player movement
class Game {
    restart() {
        // TODO(#37): a player respawn animation similar to the enemy's one
        this.player = new Player(new V2(0, 0));
        this.score = 0;
        this.mousePos = new V2(0, 0);
        this.pressedKeys = new Set();
        this.tutorial = new Tutorial();
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        this.enemySpawnRate = ENEMY_SPAWN_COOLDOWN;
        this.enemySpawnCooldown = ENEMY_SPAWN_COOLDOWN;
        this.paused = false;
        this.renderer.cameraPos = new V2(0.0, 0.0);
        this.renderer.cameraVel = new V2(0.0, 0.0);
    }

    constructor(renderer) {
        this.renderer = renderer;
        this.restart();
    }

    update(dt) {
        if (this.paused) {
            this.renderer.grayness = 1.0;
            return;
        } else {
            this.renderer.grayness = 1.0 - this.player.health / PLAYER_MAX_HEALTH;
        }

        if (this.player.health <= 0.0) {
            dt /= 50;
        }

        this.renderer.setTarget(this.player.pos);
        this.renderer.update(dt);

        let vel = new V2(0, 0);
        let moved = false;
        for (let key of this.pressedKeys) {
            if (key in directionMap) {
                vel = vel.add(directionMap[key]);
                moved = true;
            }
        }
        vel = vel.normalize().scale(PLAYER_SPEED);
        if (moved) {
            this.tutorial.playerMoved();
        }

        this.player.update(dt, vel);
        if (this.player.shooting) {
            if (performance.now() * 0.001 - this.player.lastShoot > PLAYER_SHOOT_COOLDOWN) {
                this.bullets.push(this.player.shootAt(this.renderer.screenToWorld(this.mousePos)));
            }
        }

        this.tutorial.update(dt);

        for (let enemy of this.enemies) {
            if (!enemy.ded) {
                for (let bullet of this.bullets) {
                    if (enemy.pos.dist(bullet.pos) <= BULLET_RADIUS + ENEMY_RADIUS) {
                        this.score += ENEMY_KILL_SCORE;
                        this.player.heal(ENEMY_KILL_HEAL);
                        if (bullet.lifetime > 0.0) this.player.accuracy += 1;
                        bullet.lifetime = 0.0;
                        enemy.ded = true;
                        particleBurst(this.particles, enemy.pos, ENEMY_COLOR);
                    }
                }
            }

            if (this.player.health > 0.0 && !enemy.ded) {
                if (enemy.pos.dist(this.player.pos) <= PLAYER_RADIUS + ENEMY_RADIUS) {
                    this.player.damage(ENEMY_DAMAGE);
                    if (this.player.health <= 0.0) {
                        this.player.trail.disabled = true;
                        for (let enemy of this.enemies) {
                            enemy.trail.disabled = true;
                        }
                    }
                    enemy.ded = true;
                    particleBurst(this.particles, enemy.pos, PLAYER_COLOR);
                }
            }
        }

        for (let bullet of this.bullets) {
            bullet.update(dt);
        }
        this.bullets = this.bullets.filter(bullet => bullet.lifetime > 0.0);

        for (let particle of this.particles) {
            particle.update(dt);
        }
        this.particles = this.particles.filter(particle => particle.lifetime > 0.0);

        for (let enemy of this.enemies) {
            enemy.update(dt, this.player.pos);
        }
        this.enemies = this.enemies.filter(enemy => {
            return !enemy.ded && enemy.pos.dist(this.player.pos) < ENEMY_DESPAWN_DISTANCE;
        });

        if (this.tutorial.state == TutorialState.Finished) {
            this.enemySpawnCooldown -= dt;
            if (this.enemySpawnCooldown <= 0.0) {
                this.spawnEnemy();
                this.enemySpawnCooldown = this.enemySpawnRate;
                this.enemySpawnRate /= ENEMY_SPAWN_GROWTH;
            }
        }
    }

    renderEntities(entities) {
        for (let entity of entities) {
            entity.render(this.renderer);
        }
    }

    render() {
        this.renderer.clear();

        this.renderer.background();
        this.player.render(this.renderer);

        this.renderEntities(this.bullets);
        this.renderEntities(this.particles);
        this.renderEntities(this.enemies);

        if (this.paused) {
            this.renderer.fillMessage("PAUSED (SPACE to resume)", MESSAGE_COLOR);
        } else if(this.player.health <= 0.0) {
            const accuracy = Math.ceil(100 * this.player.accuracy / Math.max(this.player.shootCount, 1.0));
            this.renderer.fillMessage(`YOUR SCORE: ${this.score}\nACCURACY: ${accuracy}%\n(SPACE to restart)`, MESSAGE_COLOR);
        } else {
            this.tutorial.render(this.renderer);
        }

        this.renderer.present();
    }

    spawnEnemy() {
        let dir = randomAngle();
        this.enemies.push(new Enemy(this.player.pos.add(V2.polar(ENEMY_SPAWN_DISTANCE, dir))));
    }

    togglePause() {
        this.paused = !this.paused;
    }

    keyDown(event) {
        if (this.player.health <= 0.0 && event.code == 'Space') {
            this.restart();
            return;
        }

        if (event.code == 'Space') {
            this.togglePause();
        }

        this.pressedKeys.add(event.code);
    }

    keyUp(event) {
        this.pressedKeys.delete(event.code);
    }

    mouseMove(event) {
        this.mousePos = new V2(event.offsetX, event.offsetY);
    }

    mouseDown(event) {
        if (this.paused) {
            return;
        }

        if (this.player.health <= 0.0) {
            return;
        }

        this.player.shooting = true;
        this.tutorial.playerShot();
        this.mousePos = new V2(event.offsetX, event.offsetY);
        this.bullets.push(this.player.shootAt(this.renderer.screenToWorld(this.mousePos)));
    }

    mouseUp(event) {
        this.player.shooting = false;
    }
}

// Resolution at which the game scale will be 1 unit per pixel


let game = null;

(() => {
    const legacy = new URLSearchParams(document.location.search).has("legacy");

    const canvas = document.getElementById("game-canvas");
    const renderer = (() => {
        if (!legacy) {
            const gl = canvas.getContext("webgl");
            if (!gl) {
                throw new Error(`Unable to initilize WebGL. Your browser probably does not support that.`);
            }

            const ext = gl.getExtension('ANGLE_instanced_arrays');
            if (!ext) {
                throw new Error(`Unable to initialize Instanced Arrays extension for WebGL. Your browser probably does not support that.`);
            }

            return new RendererWebGL(gl, ext);
        } else {
            return new Renderer2D(canvas.getContext("2d"));
        }
    })();

    let windowWasResized = true;

    game = new Game(renderer);

    // https://drafts.csswg.org/mediaqueries-4/#mf-interaction
    // https://patrickhlauke.github.io/touch/pointer-hover-any-pointer-any-hover/
    if (window.matchMedia("(pointer: coarse)").matches) {
        game.tutorial.playerMoved();
    }

    let start;
    function step(timestamp) {
        if (start === undefined) {
            start = timestamp;
        }
        const dt = (timestamp - start) * 0.001;
        start = timestamp;

        game.renderer.setTimestamp(timestamp * 0.001);

        if (windowWasResized) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            game.renderer.setViewport(window.innerWidth, window.innerHeight);
            windowWasResized = false;
        }

        game.update(dt);
        game.render();

        window.requestAnimationFrame(step);
    }

    window.requestAnimationFrame(step);

    // TODO(#30): game is not playable on mobile without external keyboard

    document.addEventListener('keydown', event => {
        game.keyDown(event);
    });

    document.addEventListener('keyup', event => {
        game.keyUp(event);
    });

    document.addEventListener('pointermove', event => {
        game.mouseMove(event);
    });

    document.addEventListener('pointerdown', event => {
        game.mouseDown(event);
    });

    document.addEventListener('pointerup', event => {
        game.mouseUp(event);
    });

    window.addEventListener('resize', event => {
        windowWasResized = true;
    });

    window.addEventListener('blur', event => {
        if (game.player.health > 0.0) {
            game.paused = true;
        }
    });

    window.addEventListener('focus', event => {
        start = performance.now() - 1000 / 60;
    });
})();
