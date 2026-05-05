// sky/sky.js
import { WeatherEngine } from "./weatherEngine.js";

async function loadText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Failed to fetch " + url);
  return r.text();
}

async function compileProgram(gl, vertURL, fragURL) {
  const vertSrc = await loadText(vertURL);
  const fragSrc = await loadText(fragURL);

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("[SKY] Shader compile error:", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);

  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("[SKY] Program link error:", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }

  return prog;
}

export const Sky = {
  gl: null,
  program: null,
  uniforms: {},
  tier: "low",
  weatherType: "sunny",
  _programCache: new Map(),
  _quadBuffer: null,
  timeStart: performance.now(),

  async init(gl, tier) {
    this.gl = gl;
    this.tier = tier;

    console.log("[SKY] Init with tier:", tier);

    // Fullscreen quad
    this._quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,  1, -1, -1,  1,
        -1,  1,  1, -1,  1,  1
      ]),
      gl.STATIC_DRAW
    );

    // Load default shader
    await this.setWeatherShader("sunny", this.tier);
  },

  async setWeatherShader(weatherType, tier) {
    this.weatherType = weatherType;
    this.tier = tier;

    const vert = "shaders/vert.glsl";
    const frag = `shaders/${weatherType}/${tier}.frag`;
    const key = `${weatherType}_${tier}`;

    console.log("[SKY] Loading shader:", frag);

    // Cache programs
    if (!this._programCache.has(key)) {
      const prog = await compileProgram(this.gl, vert, frag);
      if (!prog) throw new Error("Shader compile failed: " + frag);
      this._programCache.set(key, prog);
    }

    this.program = this._programCache.get(key);
    this._bindProgram();
  },

  _bindProgram() {
    const gl = this.gl;
    gl.useProgram(this.program);

    const u = n => gl.getUniformLocation(this.program, n);

    this.uniforms = {
      uTime:        u("uTime"),
      uResolution:  u("uResolution"),
      uMode:        u("uMode"),
      uSeed:        u("uSeed"),
      uCloudLow:    u("uCloudLow"),
      uCloudHigh:   u("uCloudHigh"),
      uSunIntensity:u("uSunIntensity"),
      uLightning:   u("uLightning"),
      uCloudSpeed:  u("uCloudSpeed"),
      uFogDensity:  u("uFogDensity"),
      uWind:        u("uWind"),
      uDayPhase:    u("uDayPhase")
    };

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuffer);
    const aPos = gl.getAttribLocation(this.program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  },

  update() {
    const gl = this.gl;
    if (!gl || !this.program) return;

    const t = (performance.now() - this.timeStart) / 1000;
    const state = WeatherEngine.update(t);

    const dpr = window.devicePixelRatio || 1;
    const w = gl.canvas.clientWidth * dpr;
    const h = gl.canvas.clientHeight * dpr;

    if (gl.canvas.width !== w || gl.canvas.height !== h) {
      gl.canvas.width = w;
      gl.canvas.height = h;
      gl.viewport(0, 0, w, h);
    }

    gl.uniform1f(this.uniforms.uTime, t);
    gl.uniform2f(this.uniforms.uResolution, w, h);

    gl.uniform1i(this.uniforms.uMode, state.mode);
    gl.uniform1f(this.uniforms.uSeed, state.seed);
    gl.uniform1f(this.uniforms.uCloudLow, state.cloudLow);
    gl.uniform1f(this.uniforms.uCloudHigh, state.cloudHigh);
    gl.uniform1f(this.uniforms.uSunIntensity, state.sunIntensity);
    gl.uniform1f(this.uniforms.uLightning, state.lightning);
    gl.uniform1f(this.uniforms.uCloudSpeed, state.cloudSpeed);
    gl.uniform1f(this.uniforms.uFogDensity, state.fogDensity);
    gl.uniform2f(this.uniforms.uWind, state.windX, state.windY);
    gl.uniform1f(this.uniforms.uDayPhase, state.dayPhase);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
};
