// ===============================
// LOGGING HELPERS
// ===============================
function log(...args) {
  console.log("%c[WeatherShader]", "color:#4af", ...args);
}
function err(...args) {
  console.error("%c[WeatherShader ERROR]", "color:#f44", ...args);
}

// ===============================
// LOAD SHADER FILE
// ===============================
async function loadShader(url) {
  log("Fetching shader:", url);
  const res = await fetch(url);
  if (!res.ok) {
    err("Failed to fetch shader:", url, "Status:", res.status);
    throw new Error("Shader fetch failed");
  }
  const text = await res.text();
  log("Shader loaded:", url, "length:", text.length);
  return text;
}

// ===============================
// MAIN INIT
// ===============================
async function init() {
  try {
    log("Initializing WebGL…");

    const canvas = document.getElementById("sky");
    const gl = canvas.getContext("webgl");

    if (!gl) {
      err("WebGL not supported");
      return;
    }

    // Resize
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

    // ===============================
    // LOAD SHADERS
    // ===============================
    const vertSrc = await loadShader("shaders/sky.vert");
    const fragSrc = await loadShader("shaders/sky.frag");

    function compile(type, src, label) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);

      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        err("Shader compile error (" + label + "):");
        err(gl.getShaderInfoLog(s));
        throw new Error("Shader compile failed: " + label);
      }

      log(label, "shader compiled OK");
      return s;
    }

    const vs = compile(gl.VERTEX_SHADER, vertSrc, "VERT");
    const fs = compile(gl.FRAGMENT_SHADER, fragSrc, "FRAG");

    // ===============================
    // LINK PROGRAM
    // ===============================
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      err("Program link error:");
      err(gl.getProgramInfoLog(prog));
      throw new Error("Program link failed");
    }

    gl.useProgram(prog);
    log("WebGL program linked OK");

    // ===============================
    // FULLSCREEN QUAD
    // ===============================
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1,-1, 1,-1, -1,1,
        -1,1, 1,-1, 1,1
      ]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(prog, "aPos");
    log("aPos location:", aPos);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // ===============================
    // UNIFORMS
    // ===============================
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uMode = gl.getUniformLocation(prog, "uMode");
    const uRes  = gl.getUniformLocation(prog, "uResolution");
    const uQual = gl.getUniformLocation(prog, "uQuality");

    log("Uniform locations:", { uTime, uMode, uRes, uQual });

    if (!uTime || !uMode || !uRes || !uQual) {
      err("One or more uniforms are NULL — shader did NOT compile correctly.");
      return;
    }

    // ===============================
    // GPU TIER DETECTION
    // ===============================
    let quality = 1;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");

    if (ext) {
      const gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      log("GPU Renderer:", gpu);

      const g = gpu.toLowerCase();
      if (g.includes("rtx") || g.includes("radeon") || g.includes("apple")) quality = 2;
      if (g.includes("intel") || g.includes("uhd")) quality = 0;
    } else {
      log("No GPU info extension — defaulting to HIGH");
    }

    gl.uniform1i(uQuality, quality);
    log("Quality tier:", quality);

    let mode = 0;

    // ===============================
    // RENDER LOOP
    // ===============================
    let start = performance.now();
    function render() {
      requestAnimationFrame(render);
      let t = (performance.now() - start) / 1000;

      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1i(uMode, mode);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    render();

    // ===============================
    // WEATHER API
    // ===============================
    async function fetchWeather(city) {
      try {
        log("Fetching weather for:", city);

        const geo = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + city).then(r=>r.json());
        if (!geo.results) {
          err("City not found:", city);
          return;
        }

        const { latitude, longitude, name, country } = geo.results[0];

        const w = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`
        ).then(r=>r.json());

        const c = w.current_weather;
        log("Weather data:", c);

        mode =
          (c.is_day === 0) ? 5 :
          [95,96,99].includes(c.weathercode) ? 3 :
          [51,53,55,61,63,65,80,81,82].includes(c.weathercode) ? 2 :
          [71,73,75,77,85,86].includes(c.weathercode) ? 4 :
          [2,3].includes(c.weathercode) ? 1 : 0;

        log("Mapped weather mode:", mode);

        document.querySelector(".city-name").textContent = `${name}, ${country}`;
        document.querySelector(".temp").textContent = `${Math.round(c.temperature)}°F`;
        document.querySelector(".condition").textContent = c.weathercode;
      } catch (e) {
        err("Weather fetch failed:", e);
      }
    }

    document.getElementById("citySearch").addEventListener("keydown", e => {
      if (e.key === "Enter") fetchWeather(e.target.value);
    });

    fetchWeather("New York");

  } catch (e) {
    err("Init crashed:", e);
  }
}

init();
