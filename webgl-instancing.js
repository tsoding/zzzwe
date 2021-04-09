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
            throw `Could not parse ${hexcolor} as color`;
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

function reportError(message) {
    const errorNode = document.querySelector('#error');
    errorNode.innerText = message;
}

const instancingVertexShaderSource = `#version 100
precision mediump float;

uniform vec2 resolution;

attribute vec2 meshPosition;

attribute vec2 circleCenter;
attribute float circleRadius;
attribute vec4 circleColor;

varying vec4 vertexColor;
varying vec2 vertexUV;

vec2 camera_projection(vec2 position) {
    return vec2(2.0 * position.x / resolution.x, 2.0 * position.y / resolution.y);
}

void main() {
    gl_Position = vec4(camera_projection(meshPosition * circleRadius + circleCenter), 0.0, 1.0);
    vertexColor = circleColor;
    vertexUV = meshPosition;
}
`;

const instancingFragmentShaderSource =`#version 100

precision mediump float;

varying vec4 vertexColor;
varying vec2 vertexUV;

void main() {
    vec4 color = vertexColor;
    gl_FragColor = length(vertexUV) < 1.0 ? color : vec4(0.0);
}
`;


// TODO: the circles are not antialised

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

const BATCH_CAPACITY = 1024;
const QUAD_VERTICIES = 4;
const TRIANGLE_VERTICIES = 3;
const TRIANGLE_PAIR = 2;
const RGBA_COUNT = 4;
const RGBA_R = 0;
const RGBA_G = 1;
const RGBA_B = 2;
const RGBA_A = 3;
const VEC4_COUNT = 4;
const VEC2_COUNT = 2;
const VEC2_X = 0;
const VEC2_Y = 1;

const POSITION_TRIANGLE_SIZE = TRIANGLE_VERTICIES * VEC2_COUNT;
const POSITION_CIRCLE_SIZE = TRIANGLE_PAIR * POSITION_TRIANGLE_SIZE;
const COLOR_TRIANGLE_SIZE = TRIANGLE_VERTICIES * RGBA_COUNT;
const COLOR_CIRCLE_SIZE = TRIANGLE_PAIR * COLOR_TRIANGLE_SIZE;
const UV_TRIANGLE_SIZE = TRIANGLE_VERTICIES * VEC2_COUNT;
const UV_CIRCLE_SIZE = TRIANGLE_PAIR * UV_TRIANGLE_SIZE;

class CircleInstancingRenderer {
    constructor(gl, ext, program, capacity) {
        this.count = 0;
        this.capacity = capacity;

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

            const meshPositionAttrib = gl.getAttribLocation(program, 'meshPosition');
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
            this.circleCenterBufferData = new Float32Array(VEC2_COUNT * capacity);
            this.circleCenterBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.circleCenterBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.circleCenterBufferData, gl.DYNAMIC_DRAW);

            const circleCenterAttrib = gl.getAttribLocation(program, 'circleCenter');
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
            this.circleRadiusBufferData = new Float32Array(capacity);
            this.circleRadiusBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.circleRadiusBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.circleRadiusBufferData, gl.DYNAMIC_DRAW);

            const circleRadiusAttrib = gl.getAttribLocation(program, 'circleRadius');
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
            this.circleColorBufferData = new Float32Array(RGBA_COUNT * capacity);
            this.circleColorBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.circleColorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.circleColorBufferData, gl.DYNAMIC_DRAW);

            const circleColorAttrib = gl.getAttribLocation(program, 'circleColor');
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
    }

    pushCircle(center, radius, color) {
        if (this.count < this.capacity) {
            this.circleCenterBufferData[this.count * VEC2_COUNT + VEC2_X] = center.x;
            this.circleCenterBufferData[this.count * VEC2_COUNT + VEC2_Y] = center.y;

            this.circleRadiusBufferData[this.count] = radius;

            this.circleColorBufferData[this.count * RGBA_COUNT + RGBA_R] = color.r;
            this.circleColorBufferData[this.count * RGBA_COUNT + RGBA_G] = color.g;
            this.circleColorBufferData[this.count * RGBA_COUNT + RGBA_B] = color.b;
            this.circleColorBufferData[this.count * RGBA_COUNT + RGBA_A] = color.a;

            this.count += 1;
        }
    }

    draw(gl, ext) {
        // TODO: bufferSubData should probably use subview of this Float32Array if that's even possible
        gl.bindBuffer(gl.ARRAY_BUFFER, this.circleCenterBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.circleCenterBufferData);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.circleRadiusBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.circleRadiusBufferData);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.circleColorBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.circleColorBufferData);
        ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, TRIANGLE_PAIR * TRIANGLE_VERTICIES, this.count);
    }

    clear() {
        this.count = 0;
    }
}


window.onload = () => {
    console.log('WebGL Instancing Tech Demo');

    try {
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

        const instancingVertexShader = compileShaderSource(gl, instancingVertexShaderSource, gl.VERTEX_SHADER);
        const instancingFragmentShader = compileShaderSource(gl, instancingFragmentShaderSource, gl.FRAGMENT_SHADER);
        const instancingProgram = linkShaderProgram(gl, [instancingVertexShader, instancingFragmentShader]);
        gl.useProgram(instancingProgram);

        let resolutionUniform = gl.getUniformLocation(instancingProgram, 'resolution');
        gl.uniform2f(resolutionUniform, canvas.width, canvas.height);

        const circleInstancingRenderer = new CircleInstancingRenderer(gl, ext, instancingProgram, BATCH_CAPACITY);
        circleInstancingRenderer.pushCircle(new V2(0, 0), 100, new Color(1, 0, 0, 1));
        circleInstancingRenderer.pushCircle(new V2(50, 50), 50, new Color(0, 0, 1, 1));

        console.log(circleInstancingRenderer.meshPositionBufferData);
        console.log(circleInstancingRenderer.circleCenterBufferData);
        console.log(circleInstancingRenderer.circleRadiusBufferData);
        console.log(circleInstancingRenderer.circleColorBufferData);

        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        circleInstancingRenderer.draw(gl, ext);
    } catch (err) {
        reportError(err.message);
        console.error(err);
    }
};
