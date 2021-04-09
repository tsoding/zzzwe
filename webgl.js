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

const vertexShaderSource =`#version 100

precision mediump float;

attribute vec2 position;
attribute vec4 color;
attribute vec2 uv;

uniform vec2 resolution;

varying vec4 vertexColor;
varying vec2 vertexUV;

vec2 camera_projection(vec2 position) {
    return vec2(2.0 * position.x / resolution.x, 2.0 * position.y / resolution.y);
}

void main() {
    gl_Position = vec4(camera_projection(position), 0.0, 1.0);
    vertexColor = color;
    vertexUV = uv;
}
`;

// TODO: the circles are not antialised

const fragmentShaderSource =`#version 100

precision mediump float;

varying vec4 vertexColor;
varying vec2 vertexUV;

void main() {
    vec4 color = vertexColor;
    gl_FragColor = length(vertexUV - vec2(0.5, 0.5)) < 0.5 ? color : vec4(0.0);
}
`;

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

// TODO: CircleRenderer does not use instancing
class CircleRenderer {

    constructor(gl, program, capacity) {
        this.count = 0;
        this.capacity = capacity;

        // Position Attribute
        {
            this.positionBufferData = new Float32Array(TRIANGLE_PAIR * TRIANGLE_VERTICIES * VEC2_COUNT * capacity);

            this.positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.positionBufferData, gl.DYNAMIC_DRAW);

            const positionAttrib = gl.getAttribLocation(program, 'position');
            gl.vertexAttribPointer(
                positionAttrib,
                VEC2_COUNT,
                gl.FLOAT,
                false,
                0,
                0);
            gl.enableVertexAttribArray(positionAttrib);
        }

        // Color Attribute
        {
            this.colorBufferData = new Float32Array(TRIANGLE_PAIR * TRIANGLE_VERTICIES * RGBA_COUNT * capacity);

            this.colorBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.colorBufferData, gl.DYNAMIC_DRAW);

            const colorAttrib = gl.getAttribLocation(program, 'color');
            gl.vertexAttribPointer(
                colorAttrib,
                RGBA_COUNT,
                gl.FLOAT,
                false,
                0,
                0);
            gl.enableVertexAttribArray(colorAttrib);
        }

        // UV Attribute
        {
            this.uvBufferData = new Float32Array(TRIANGLE_PAIR * TRIANGLE_VERTICIES * VEC2_COUNT * capacity);

            this.uvBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.uvBufferData, gl.DYNAMIC_DRAW);

            const uvAttrib = gl.getAttribLocation(program, 'uv');
            gl.vertexAttribPointer(
                uvAttrib,
                VEC2_COUNT,
                gl.FLOAT,
                false,
                0,
                0);
            gl.enableVertexAttribArray(uvAttrib);
        }
    }

    pushCircle(center, radius, color) {
        if (this.count < this.capacity) {
            for (let triangle = 0; triangle < TRIANGLE_PAIR; ++triangle) {
                for (let vertex = 0; vertex < TRIANGLE_VERTICIES; ++vertex) {
                    let quad = triangle + vertex;
                    const uv_x = quad & 1;
                    const uv_y = (quad >> 1) & 1;
                    const x = 2 * uv_x - 1;
                    const y = 2 * uv_y - 1;

                    {
                        const position_offset =
                              this.count * POSITION_TRIANGLE_SIZE +
                              vertex * VEC2_COUNT;
                        this.positionBufferData[position_offset + VEC2_X] = x * radius + center.x;
                        this.positionBufferData[position_offset + VEC2_Y] = y * radius + center.y;
                    }

                    {
                        const color_offset =
                              this.count * COLOR_TRIANGLE_SIZE +
                              vertex * RGBA_COUNT;
                        this.colorBufferData[color_offset + RGBA_R] = color.r;
                        this.colorBufferData[color_offset + RGBA_G] = color.g;
                        this.colorBufferData[color_offset + RGBA_B] = color.b;
                        this.colorBufferData[color_offset + RGBA_A] = color.a;
                    }

                    {
                        const uv_offset =
                              this.count * UV_TRIANGLE_SIZE +
                              vertex * VEC2_COUNT;
                        this.uvBufferData[uv_offset + VEC2_X] = uv_x;
                        this.uvBufferData[uv_offset + VEC2_Y] = uv_y;
                    }
                }

                this.count += 1;
            }
        }
    }

    draw(gl) {
        // TODO: bufferSubData should probably use subview of this Float32Array if that's even possible
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positionBufferData);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colorBufferData);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.uvBufferData);
        gl.drawArrays(gl.TRIANGLES, 0, this.count * TRIANGLE_VERTICIES);
    }

    clear() {
        this.count = 0;
    }
};

window.onload = () => {
    try {
        const canvas = document.querySelector('#idCanvas');
        const gl = canvas.getContext("webgl");

        if (gl === null) {
            throw new Error(`Unable to initilize WebGL. Your browser probably does not support that.`);
        }

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const vertexShader = compileShaderSource(gl, vertexShaderSource, gl.VERTEX_SHADER);
        const fragmentShader = compileShaderSource(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
        const program = linkShaderProgram(gl, [vertexShader, fragmentShader]);
        gl.useProgram(program);

        let resolutionUniform = gl.getUniformLocation(program, 'resolution');
        gl.uniform2f(resolutionUniform, canvas.width, canvas.height);

        const circleRenderer = new CircleRenderer(gl, program, BATCH_CAPACITY);

        circleRenderer.pushCircle(new V2(0, 0), 100, new Color(1, 0, 0, 1));
        circleRenderer.pushCircle(new V2(50, 50), 50, new Color(0, 0, 1, 1));

        console.log(circleRenderer.positionBufferData);
        console.log(circleRenderer.colorBufferData);
        console.log(circleRenderer.uvBufferData);

        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        // gl.drawArrays(gl.TRIANGLE_STRIP, 0, QUAD_VERTICIES);
        circleRenderer.draw(gl);
    } catch (err) {
        reportError(err.message);
        console.error(err);
    }
};
