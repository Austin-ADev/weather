import { Clouds } from "./clouds.js";
import { Lighting } from "./lighting.js";

async function loadText(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error("Failed to fetch " + url);
  return r.text();
}

async function loadShaderProgram(gl, vertURL, fragURL){
  const vertSrc = await loadText(vertURL);
  const fragSrc = await loadText(fragURL);

  function compile(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      console.error("[Shader]", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
  if(!vs || !fs) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);

  if(!gl.getProgramParameter(prog, gl.LINK_STATUS)){
    console.error("[Program]", gl.getProgramInfoLog(prog));
    return null;
  }

  return prog;
}

export const Sky = {
  gl:null, program:null, uniforms:{},
  mode:0, tier:1, seed:Math.random()*1000,
  timeStart:performance.now(),
  shaderSets:null,

  async init(gl, shaderSets){
    this.gl = gl;
    this.shaderSets = shaderSets;

    this.program = await this.loadTier(this.tier);
    gl.useProgram(this.program);

    const u = n=>gl.getUniformLocation(this.program,n);

    this.uniforms = {
      uTime: u("uTime"),
      uResolution: u("uResolution"),
      uMode: u("uMode"),
      uQuality: u("uQuality"),
      uSeed: u("uSeed"),
      uCloudLow: u("uCloudLow"),
      uCloudHigh: u("uCloudHigh"),
      uSunIntensity: u("uSunIntensity"),
      uLightning: u("uLightning")
    };

    gl.uniform1i(this.uniforms.uQuality, this.tier);
    gl.uniform1f(this.uniforms.uSeed, this.seed);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1, 1,-1, -1,1,
      -1,1, 1,-1, 1,1
    ]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(this.program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  },

  async loadTier(tier){
    const gl = this.gl;
    for(const s of this.shaderSets){
      if(s.tier > tier) continue;
      const p = await loadShaderProgram(gl, s.vert, s.frag);
      if(p) return p;
    }
    throw new Error("No shader for tier " + tier);
  },

  async switchTier(tier){
    this.tier = tier;
    this.program = await this.loadTier(this.tier);
    this.gl.useProgram(this.program);

    const u = n=>this.gl.getUniformLocation(this.program,n);
    this.uniforms = {
      uTime: u("uTime"),
      uResolution: u("uResolution"),
      uMode: u("uMode"),
      uQuality: u("uQuality"),
      uSeed: u("uSeed"),
      uCloudLow: u("uCloudLow"),
      uCloudHigh: u("uCloudHigh"),
      uSunIntensity: u("uSunIntensity"),
      uLightning: u("uLightning")
    };

    this.gl.uniform1i(this.uniforms.uQuality, this.tier);
    this.gl.uniform1f(this.uniforms.uSeed, this.seed);
  },

  setMode(m){ this.mode = m; },
  setSeed(s){ this.seed = s; },

  update(){
    const gl = this.gl;
    const t = (performance.now() - this.timeStart) / 1000;

    gl.uniform1f(this.uniforms.uTime, t);
    gl.uniform2f(this.uniforms.uResolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1i(this.uniforms.uMode, this.mode);
    gl.uniform1f(this.uniforms.uSeed, this.seed);

    const cloud = Clouds.compute(this.mode, t);
    const light = Lighting.compute(this.mode, t);

    gl.uniform1f(this.uniforms.uCloudLow, cloud.low);
    gl.uniform1f(this.uniforms.uCloudHigh, cloud.high);
    gl.uniform1f(this.uniforms.uSunIntensity, light.sun);
    gl.uniform1f(this.uniforms.uLightning, light.lightning);
  }
};
