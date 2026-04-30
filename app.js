async function loadShader(url) {
  return fetch(url).then(r => r.text());
}

async function init() {
  const canvas = document.getElementById("sky");
  const gl = canvas.getContext("webgl");

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  addEventListener("resize", resize);

  const vertSrc = await loadShader("shaders/sky.vert");
  const fragSrc = await loadShader("shaders/sky.frag");

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fragSrc);

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1,-1, 1,-1, -1,1,
    -1,1, 1,-1, 1,1
  ]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(prog, "uTime");
  const uMode = gl.getUniformLocation(prog, "uMode");
  const uRes  = gl.getUniformLocation(prog, "uResolution");
  const uQual = gl.getUniformLocation(prog, "uQuality");

  // GPU tier detection
  let quality = 1;
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  if (ext) {
    const gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL).toLowerCase();
    if (gpu.includes("rtx") || gpu.includes("radeon") || gpu.includes("apple")) quality = 2;
    if (gpu.includes("intel") || gpu.includes("uhd")) quality = 0;
  }

  gl.uniform1i(uQuality, quality);

  let mode = 0;

  function render() {
    requestAnimationFrame(render);
    gl.uniform1f(uTime, performance.now() / 1000);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1i(uMode, mode);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  render();

  // Weather API
  async function fetchWeather(city) {
    const geo = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + city).then(r=>r.json());
    if (!geo.results) return;

    const { latitude, longitude, name, country } = geo.results[0];

    const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`).then(r=>r.json());
    const c = w.current_weather;

    mode = (c.is_day === 0) ? 5 :
           [95,96,99].includes(c.weathercode) ? 3 :
           [51,53,55,61,63,65,80,81,82].includes(c.weathercode) ? 2 :
           [71,73,75,77,85,86].includes(c.weathercode) ? 4 :
           [2,3].includes(c.weathercode) ? 1 : 0;

    document.querySelector(".city-name").textContent = `${name}, ${country}`;
    document.querySelector(".temp").textContent = `${Math.round(c.temperature)}°F`;
    document.querySelector(".condition").textContent = c.weathercode;
  }

  document.getElementById("citySearch").addEventListener("keydown", e => {
    if (e.key === "Enter") fetchWeather(e.target.value);
  });

  fetchWeather("New York");
}

init();
