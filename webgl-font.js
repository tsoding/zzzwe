const TRIANGLE_PAIR = 2;
const TRIANGLE_VERTICIES = 3;
const VEC2_COUNT = 2;
const VEC2_X = 0;
const VEC2_Y = 1;
const LETTERS_CAPACITY = 1024;

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
        throw new Error(`Could not compile ${shaderTypeToString(gl, shaderType)} shader: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
}

function linkShaderProgram(gl, shaders) {
    const program = gl.createProgram();
    for (let shader of shaders) {
        gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`Could not link shader program: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
}

vertexShaderSource = `#version 100

precision mediump float;

attribute vec2 meshPosition;
attribute float letterIndex;
attribute float letter;

uniform vec2 resolution;
uniform vec2 messagePosition;
uniform float messageScale;
uniform vec4 messageColor;

varying vec2 uv;

#define FONT_SHEET_WIDTH 128
#define FONT_SHEET_HEIGHT 64
#define FONT_SHEET_COLS 18
#define FONT_SHEET_ROWS 7
#define FONT_CHAR_WIDTH (FONT_SHEET_WIDTH / FONT_SHEET_COLS)
#define FONT_CHAR_HEIGHT (FONT_SHEET_HEIGHT / FONT_SHEET_ROWS)

void main() {
    // float letterIndex = 1.0;
    vec2 meshPositionUV = (meshPosition + vec2(1.0, 1.0)) / 2.0;
    vec2 screenPosition = 
        meshPositionUV * vec2(float(FONT_CHAR_WIDTH), float(FONT_CHAR_HEIGHT)) * messageScale +
        messagePosition +
        vec2(float(FONT_CHAR_WIDTH) * messageScale * letterIndex, 0.0);

    gl_Position = vec4(2.0 * screenPosition / resolution, 0.0, 1.0);

    float charIndex = letter - 32.0;
    float charU = (floor(mod(charIndex, float(FONT_SHEET_COLS))) + meshPositionUV.x) * float(FONT_CHAR_WIDTH) / float(FONT_SHEET_WIDTH);
    float charV = (floor(charIndex / float(FONT_SHEET_COLS)) + (1.0 - meshPositionUV.y)) * float(FONT_CHAR_HEIGHT) / float(FONT_SHEET_HEIGHT);
    uv = vec2(charU, charV);
}
`;

fragmentShaderSource = `#version 100

precision mediump float;

uniform sampler2D font;

varying vec2 uv;

void main() {
    gl_FragColor = texture2D(font, uv);
}
`;

window.onload = () => {
    const canvas = document.querySelector('#idCanvas');
    const gl = canvas.getContext("webgl");

    if (gl === null) {
        throw new Error(`Unable to initilize WebGL. Your browser probably does not support that.`);
    }

    const ext = gl.getExtension('ANGLE_instanced_arrays');
    if (!ext) {
        throw new Error(`Unable to initialize Instanced Arrays extension for WebGL. Your browser probably does not support that.`);
    }

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

    const vertexShader = compileShaderSource(gl, vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShaderSource(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
    const program = linkShaderProgram(gl, [vertexShader, fragmentShader]);

    gl.useProgram(program);

    let resolutionUniform = gl.getUniformLocation(program, 'resolution');
    gl.uniform2f(resolutionUniform, canvas.width, canvas.height);

    let messagePositionUniform = gl.getUniformLocation(program, 'messagePosition');
    gl.uniform2f(messagePositionUniform, 0.0, 0.0);

    let messageScaleUniform = gl.getUniformLocation(program, 'messageScale');
    gl.uniform1f(messageScaleUniform, 3.0);

    let messageColorUniform = gl.getUniformLocation(program, 'messageColor');
    gl.uniform4f(messageColorUniform, 0.0, 1.0, 0.0, 1.0);

    // Mesh Position
    {
        let meshPositionBufferData = new Float32Array(TRIANGLE_PAIR * TRIANGLE_VERTICIES * VEC2_COUNT);
        for (let triangle = 0; triangle < TRIANGLE_PAIR; ++triangle) {
            for (let vertex = 0; vertex < TRIANGLE_VERTICIES; ++vertex) {
                const quad = triangle + vertex;
                const index =
                      triangle * TRIANGLE_VERTICIES * VEC2_COUNT +
                      vertex * VEC2_COUNT;
                meshPositionBufferData[index + VEC2_X] = (2 * (quad & 1) - 1);
                meshPositionBufferData[index + VEC2_Y] = (2 * ((quad >> 1) & 1) - 1);
            }
        }

        let meshPositionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, meshPositionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, meshPositionBufferData, gl.STATIC_DRAW);

        const meshPositionAttrib = 0;
        gl.vertexAttribPointer(
            meshPositionAttrib,
            VEC2_COUNT,
            gl.FLOAT,
            false,
            0,
            0);
        gl.enableVertexAttribArray(meshPositionAttrib);
    }

    // Letter Index
    {
        let letterIndexBufferData = new Float32Array(LETTERS_CAPACITY);
        for (let i = 0; i < LETTERS_CAPACITY; ++i) {
            letterIndexBufferData[i] = i;
        }

        let letterIndexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, letterIndexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, letterIndexBufferData, gl.STATIC_DRAW);
        
        const letterIndexAttrib = 1;
        gl.vertexAttribPointer(
            letterIndexAttrib,
            1,
            gl.FLOAT,
            false,
            0,
            0);
        gl.enableVertexAttribArray(letterIndexAttrib);
        ext.vertexAttribDivisorANGLE(letterIndexAttrib, 1);
    }

    let message = "Hello, World";

    // Letter
    {
        let letterBufferData = new Float32Array(LETTERS_CAPACITY);

        for (let i = 0; i < message.length && i < letterBufferData.length; ++i) {
            letterBufferData[i] = message.charCodeAt(i);
        }

        let letterBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, letterBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, letterBufferData, gl.DYNAMIC_DRAW);
        
        const letterAttrib = 2;
        gl.vertexAttribPointer(
            letterAttrib,
            1,
            gl.FLOAT,
            false,
            0,
            0);
        gl.enableVertexAttribArray(letterAttrib);
        ext.vertexAttribDivisorANGLE(letterAttrib, 1);
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, TRIANGLE_PAIR * TRIANGLE_VERTICIES, message.length);
    // gl.drawArrays(gl.TRIANGLES, 0, TRIANGLE_PAIR * TRIANGLE_VERTICIES);
}
