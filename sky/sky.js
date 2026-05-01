import { Clouds } from "./clouds.js";
import { Lighting } from "./lighting.js";

export const Sky = {
  gl:null, program:null, uniforms:{},
  mode:0, tier:1, seed:Math.random()*1000,
  timeStart:performance.now(),

  async init(gl, shaderSets){
    this.gl = gl;
    this.program = await this.loadTier(shaderSets, this.tier);
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

    // fullscreen quad
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

  async loadTier(shaderSets, tier){
    for(const s of shaderSets){
      if(s.tier > tier) continue;
      const p = await loadShaderProgram(this.gl, s.vert, s.frag);
      if(p) return p;
    }
    throw new Error("No shader for tier " + tier);
  },

  setMode(m){ this.mode = m; },
  setTier(t){ this.tier = t; },
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
