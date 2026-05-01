// =====================================================
// LOG HELPERS
// =====================================================
function log(...a){ console.log("%c[WeatherShader]","color:#4af",...a) }
function err(...a){ console.error("%c[WeatherShader ERROR]","color:#f44",...a) }

// =====================================================
// FETCH TEXT FILE
// =====================================================
async function loadText(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error("Failed to fetch " + url);
  return r.text();
}

// =====================================================
// LOAD SHADER PROGRAM
// =====================================================
async function loadShaderProgram(gl, vertURL, fragURL){
  const vertSrc = await loadText(vertURL);
  const fragSrc = await loadText(fragURL);

  function compile(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      err(gl.getShaderInfoLog(s));
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
    err(gl.getProgramInfoLog(prog));
    return null;
  }

  return prog;
}

// =====================================================
// MAIN INIT
// =====================================================
async function init(){
  const canvas = document.getElementById("sky");
  const gl = canvas.getContext("webgl");

  function resize(){
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    gl.viewport(0,0,canvas.width,canvas.height);
  }
  resize();
  addEventListener("resize", resize);

  // GPU tier
  let tier = 1;

  const shaderSets = [
    { tier:2, vert:"shaders/ultra.vert?v=999", frag:"shaders/ultra.frag?v=999" },
    { tier:1, vert:"shaders/high.vert?v=999",  frag:"shaders/high.frag?v=999" },
    { tier:0, vert:"shaders/perf.vert?v=999",  frag:"shaders/perf.frag?v=999" }
  ];

  let program = null;

  async function loadTier(t){
    for(const s of shaderSets){
      if(s.tier > t) continue;
      const p = await loadShaderProgram(gl, s.vert, s.frag);
      if(p){
        program = p;
        gl.useProgram(program);
        return;
      }
    }
  }

  await loadTier(tier);

  // Console tier switcher
  window.setTier = async function(newTier){
    tier = newTier;
    await loadTier(tier);
  };

  // Fullscreen quad
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1,-1, 1,-1, -1,1,
    -1,1, 1,-1, 1,1
  ]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(program, "uTime");
  const uRes  = gl.getUniformLocation(program, "uResolution");
  const uMode = gl.getUniformLocation(program, "uMode");
  const uQual = gl.getUniformLocation(program, "uQuality");

  gl.uniform1i(uQual, tier);

  let mode = 0;
  let start = performance.now();

  function render(){
    requestAnimationFrame(render);
    let t = (performance.now() - start) / 1000;

    gl.uniform1f(uTime, t);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1i(uMode, mode);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  render();

  // WEATHER API
  async function fetchWeather(city){
    const geo = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + city).then(r=>r.json());
    if(!geo.results) return;

    const { latitude, longitude, name, country } = geo.results[0];

    const w = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`
    ).then(r=>r.json());

    const c = w.current_weather;

    mode =
      (c.is_day === 0) ? 5 :
      [95,96,99].includes(c.weathercode) ? 3 :
      [51,53,55,61,63,65,80,81,82].includes(c.weathercode) ? 2 :
      [71,73,75,77,85,86].includes(c.weathercode) ? 4 :
      [2,3].includes(c.weathercode) ? 1 : 0;

    document.querySelector(".city-name").textContent = `${name}, ${country}`;
    document.querySelector(".temp").textContent = `${Math.round(c.temperature)}°F`;
    document.querySelector(".condition").textContent = c.weathercode;
  }

  document.getElementById("citySearch").addEventListener("keydown", e=>{
    if(e.key === "Enter") fetchWeather(e.target.value);
  });

  fetchWeather("New York");
}

init();
