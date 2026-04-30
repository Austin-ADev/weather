// =====================================================
// LOG HELPERS
// =====================================================
function log(...a){ console.log("%c[WeatherShader]","color:#4af",...a) }
function err(...a){ console.error("%c[WeatherShader ERROR]","color:#f44",...a) }

// =====================================================
// FETCH TEXT FILE
// =====================================================
async function loadText(url){
  log("Fetching:", url)
  const r = await fetch(url)
  if(!r.ok){
    err("Failed to fetch:", url, "Status:", r.status)
    throw new Error("Fetch failed: " + url)
  }
  return r.text()
}

// =====================================================
// LOAD + COMPILE + LINK SHADER PROGRAM
// =====================================================
async function loadShaderProgram(gl, vertURL, fragURL){
  try{
    const vertSrc = await loadText(vertURL)
    const fragSrc = await loadText(fragURL)

    function compile(type, src, label){
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)

      if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
        err("Compile fail ("+label+"):", gl.getShaderInfoLog(s))
        return null
      }

      log(label, "compiled OK")
      return s
    }

    const vs = compile(gl.VERTEX_SHADER, vertSrc, vertURL)
    const fs = compile(gl.FRAGMENT_SHADER, fragSrc, fragURL)
    if(!vs || !fs) return null

    const prog = gl.createProgram()
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)

    if(!gl.getProgramParameter(prog, gl.LINK_STATUS)){
      err("Link fail:", gl.getProgramInfoLog(prog))
      return null
    }

    log("Linked:", vertURL, "+", fragURL)
    return prog

  }catch(e){
    err("Shader load error:", e)
    return null
  }
}

// =====================================================
// MAIN INIT
// =====================================================
async function init(){
  const canvas = document.getElementById("sky")
  const gl = canvas.getContext("webgl")
  if(!gl){ err("WebGL unsupported"); return }

  // ---------------------------
  // Resize
  // ---------------------------
  function resize(){
    const dpr = window.devicePixelRatio || 1
    canvas.width = innerWidth * dpr
    canvas.height = innerHeight * dpr
    canvas.style.width = innerWidth + "px"
    canvas.style.height = innerHeight + "px"
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
  resize()
  addEventListener("resize", resize)

  // ---------------------------
  // GPU TIER DETECTION
  // ---------------------------
  let tier = 1
  const ext = gl.getExtension("WEBGL_debug_renderer_info")
  if(ext){
    const gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL).toLowerCase()
    log("GPU:", gpu)

    if(gpu.includes("rtx") || gpu.includes("radeon") || gpu.includes("apple")) tier = 2
    if(gpu.includes("intel") || gpu.includes("uhd") || gpu.includes("hd")) tier = 0
  }
  log("Selected tier:", tier)

  // ---------------------------
  // SHADER SETS (with cache‑bust)
  // ---------------------------
  const shaderSets = [
    { tier:2, vert:"shaders/ultra.vert?v=999", frag:"shaders/ultra.frag?v=999" },
    { tier:1, vert:"shaders/high.vert?v=999",  frag:"shaders/high.frag?v=999" },
    { tier:0, vert:"shaders/perf.vert?v=999",  frag:"shaders/perf.frag?v=999" }
  ]

  // ---------------------------
  // TRY SHADERS IN ORDER
  // ---------------------------
  let program = null
  for(const s of shaderSets){
    if(s.tier > tier) continue
    log("Trying shader:", s.vert, "+", s.frag)
    program = await loadShaderProgram(gl, s.vert, s.frag)
    if(program) break
  }

  if(!program){
    err("No shader could be loaded — nothing to render")
    return
  }

  gl.useProgram(program)

  // ---------------------------
  // FULLSCREEN QUAD
  // ---------------------------
  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1,-1, 1,-1, -1,1,
    -1,1, 1,-1, 1,1
  ]), gl.STATIC_DRAW)

  const aPos = gl.getAttribLocation(program, "aPos")
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  // ---------------------------
  // UNIFORMS
  // ---------------------------
  const uTime = gl.getUniformLocation(program, "uTime")
  const uRes  = gl.getUniformLocation(program, "uResolution")
  const uMode = gl.getUniformLocation(program, "uMode")
  const uQual = gl.getUniformLocation(program, "uQuality")

  log("Uniforms:", {uTime, uRes, uMode, uQual})

  if(!uTime || !uRes || !uMode || !uQual){
    err("Uniforms missing — shader did not use them")
    return
  }

  gl.uniform1i(uQual, tier)

  // ---------------------------
  // RENDER LOOP
  // ---------------------------
  let mode = 0
  let start = performance.now()

  function render(){
    requestAnimationFrame(render)
    let t = (performance.now() - start) / 1000

    gl.uniform1f(uTime, t)
    gl.uniform2f(uRes, canvas.width, canvas.height)
    gl.uniform1i(uMode, mode)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }
  render()

  // ---------------------------
  // WEATHER API
  // ---------------------------
  async function fetchWeather(city){
    try{
      const geo = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + city).then(r=>r.json())
      if(!geo.results){ err("City not found"); return }

      const { latitude, longitude, name, country } = geo.results[0]

      const w = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`
      ).then(r=>r.json())

      const c = w.current_weather

      mode =
        (c.is_day === 0) ? 5 :
        [95,96,99].includes(c.weathercode) ? 3 :
        [51,53,55,61,63,65,80,81,82].includes(c.weathercode) ? 2 :
        [71,73,75,77,85,86].includes(c.weathercode) ? 4 :
        [2,3].includes(c.weathercode) ? 1 : 0

      document.querySelector(".city-name").textContent = `${name}, ${country}`
      document.querySelector(".temp").textContent = `${Math.round(c.temperature)}°F`
      document.querySelector(".condition").textContent = c.weathercode

    }catch(e){
      err("Weather error:", e)
    }
  }

  document.getElementById("citySearch").addEventListener("keydown", e=>{
    if(e.key === "Enter") fetchWeather(e.target.value)
  })

  fetchWeather("New York")
}

init()
