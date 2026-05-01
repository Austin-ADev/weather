// sky/sky.js
import { WeatherEngine } from "./weatherEngine.js";

async function loadText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Failed to fetch " + url);
  return r.text();
}

async function loadShaderProgram(gl, vertURL, fragURL) {
  const vertSrc = await loadText(vertURL);
  const fragSrc = await loadText(fragURL);

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("[Shader]", gl.getShaderInfoLog(s));
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
    console.error("[Program]", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

export const Sky = {
  gl: null,
  program: null,
  uniforms: {},
  shaderSets: null,
  tier: 1,
  timeStart: performance.now(),
  _programCache: new Map(),
  _quadBuffer: null,

  async init(gl, shaderSets, initialTier = 1) {
    this.gl = gl;
    this.shaderSets = shaderSets;
    this.tier = initialTier;

    // fullscreen quad
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

    this.program = await this._loadTierProgram(this.tier);
    this._useProgramAndBind();
  },

  async _loadTierProgram(tier) {
    if (this._programCache.has(tier)) {
      return this._programCache.get(tier);
    }

    const gl = this.gl;
    let chosen = null;

    for (const s of this.shaderSets) {
      if (s.tier <= tier) {
        if (!chosen || s.tier > chosen.tier) chosen = s;
      }
    }

    if (!chosen) throw new Error("No shader for tier " + tier);

    const prog = await loadShaderProgram(gl, chosen.vert, chosen.frag);
    if (!prog) throw new Error("Failed to compile shader for tier " + tier);

    this._programCache.set(tier, prog);
    return prog;
  },

  _useProgramAndBind() {
    const gl = this.gl;
    gl.useProgram(this.program);

    const u = n => gl.getUniformLocation(this.program, n);
    this.uniforms = {
      uTime:        u("uTime"),
      uResolution:  u("uResolution"),
      uMode:        u("uMode"),
      uQuality:     u("uQuality"),
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

    if (this.uniforms.uQuality) {
      gl.uniform1i(this.uniforms.uQuality, this.tier);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuffer);
    const aPos = gl.getAttribLocation(this.program, "aPos");
    if (aPos !== -1) {
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    }
  },

  async switchTier(tier) {
    if (tier === this.tier) return;
    this.tier = tier;
    this.program = await this._loadTierProgram(this.tier);
    this._useProgramAndBind();
  },

  update() {
    const gl = this.gl;
    if (!gl || !this.program) return;

    const t = (performance.now() - this.timeStart) / 1000;
    const state = WeatherEngine.update(t);
    if (!state) return;

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
