// ===============================
// API
// ===============================
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search?name=";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

// ===============================
// UI ELEMENTS
// ===============================
const cityInput = document.getElementById("citySearch");
const cityNameEl = document.querySelector(".city-name");
const tempEl = document.querySelector(".temp");
const conditionEl = document.querySelector(".condition");
const detailBoxes = document.querySelectorAll(".detail-box strong");

// ===============================
// WEBGL SETUP
// ===============================
const canvas = document.getElementById("sky");
const gl = canvas.getContext("webgl");
if (!gl) {
  alert("WebGL not supported");
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ===============================
// SHADERS
// ===============================
const vertSrc = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = (aPos + 1.0) * 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// Fragment shader: realistic sky + clouds + rain/snow/storm/night
const fragSrc = `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;
uniform int uMode;     // 0 clear,1 cloudy,2 rain,3 storm,4 snow,5 night
uniform int uQuality;  // 0 perf,1 high,2 ultra

// Simple hash
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// 2D noise
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// FBM
float fbm(vec2 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

// Atmospheric gradient
vec3 skyColor(float h, int mode) {
  if (mode == 5) {
    // night
    return mix(vec3(0.01, 0.02, 0.06), vec3(0.02, 0.03, 0.1), h);
  }
  if (mode == 2 || mode == 3) {
    // rain / storm
    return mix(vec3(0.08, 0.09, 0.12), vec3(0.02, 0.03, 0.06), h);
  }
  if (mode == 4) {
    // snow
    return mix(vec3(0.85, 0.9, 0.98), vec3(0.5, 0.6, 0.8), h);
  }
  // clear / cloudy
  return mix(vec3(0.55, 0.7, 0.95), vec3(0.1, 0.2, 0.4), h);
}

// Sun
vec3 sun(vec2 uv, int mode) {
  if (mode == 5) return vec3(0.0);
  vec2 p = uv - vec2(0.8, 0.2);
  float r = length(p);
  float core = smoothstep(0.08, 0.0, r);
  float glow = smoothstep(0.4, 0.1, r);
  vec3 col = vec3(1.0, 0.95, 0.85) * core + vec3(1.0, 0.9, 0.7) * glow * 0.6;
  return col;
}

// Clouds
float cloudField(vec2 uv, int mode, int quality) {
  float t = uTime * 0.03;
  float scale = (mode == 3) ? 3.0 : 2.0;
  vec2 p = uv * scale;
  p.x += t * ((mode == 3) ? 0.6 : 0.2);
  int oct = (quality == 2) ? 6 : (quality == 1 ? 4 : 3);
  float n = fbm(p, oct);
  if (mode == 3) {
    n = pow(n, 3.0);
  } else {
    n = pow(n, 2.0);
  }
  return n;
}

// Stars
vec3 stars(vec2 uv) {
  vec2 p = uv * vec2(1.5, 1.0);
  float n = noise(p * 80.0);
  float s = step(0.995, n);
  float tw = noise(p * 20.0 + uTime * 0.2);
  float a = s * (0.4 + 0.6 * tw);
  return vec3(1.0) * a;
}

// Rain
float rainMask(vec2 uv, int quality) {
  float density = (quality == 2) ? 220.0 : (quality == 1 ? 160.0 : 110.0);
  vec2 p = uv * vec2(density, density * 1.5);
  p.y += uTime * 4.0;
  float n = noise(p);
  float drop = smoothstep(0.98, 1.0, n);
  return drop;
}

// Snow
float snowMask(vec2 uv, int quality) {
  float density = (quality == 2) ? 140.0 : (quality == 1 ? 100.0 : 70.0);
  vec2 p = uv * vec2(density, density);
  p.y += uTime * 0.6;
  p.x += sin(p.y * 0.3 + uTime * 0.3) * 0.1;
  float n = noise(p);
  float flake = smoothstep(0.985, 1.0, n);
  return flake;
}

// Lightning
float lightningFlash(int mode) {
  if (mode != 3) return 0.0;
  float t = fract(uTime * 0.25);
  float f = smoothstep(0.0, 0.1, t) * smoothstep(0.3, 0.2, t);
  return f * 0.9;
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  float h = clamp(uv.y, 0.0, 1.0);
  vec3 col = skyColor(h, uMode);

  // Sun
  col += sun(uv, uMode);

  // Clouds
  float cMask = 0.0;
  if (uMode == 0 || uMode == 1 || uMode == 2 || uMode == 3 || uMode == 4 || uMode == 5) {
    cMask = cloudField(uv, uMode, uQuality);
    float base = (uMode == 0) ? 0.3 : (uMode == 1 ? 0.55 : (uMode == 4 ? 0.7 : 0.6));
    float strength = (uMode == 3) ? 1.4 : 1.0;
    vec3 cCol = mix(vec3(base), vec3(1.0), cMask) * strength;
    float alpha = (uMode == 0) ? 0.5 : (uMode == 1 ? 0.8 : (uMode == 4 ? 0.9 : 0.85));
    col = mix(col, cCol, alpha);
  }

  // Night stars
  if (uMode == 5) {
    col += stars(uv) * 1.2;
  }

  // Rain
  if (uMode == 2 || uMode == 3) {
    float r = rainMask(uv, uQuality);
    col = mix(col, vec3(0.8, 0.85, 0.95), r * 0.7);
  }

  // Snow
  if (uMode == 4) {
    float s = snowMask(uv, uQuality);
    col = mix(col, vec3(1.0), s * 0.9);
  }

  // Lightning
  float lf = lightningFlash(uMode);
  col += vec3(lf);

  // Subtle vignette
  float d = length(p);
  float vig = smoothstep(1.2, 0.4, d);
  col *= vig;

  gl_FragColor = vec4(col, 1.0);
}
`;

// ===============================
// COMPILE SHADERS
// ===============================
function compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

const vs = compileShader(gl.VERTEX_SHADER, vertSrc);
const fs = compileShader(gl.FRAGMENT_SHADER, fragSrc);
const prog = gl.createProgram();
gl.attachShader(prog, vs);
gl.attachShader(prog, fs);
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
  console.error(gl.getProgramInfoLog(prog));
}
gl.useProgram(prog);

// ===============================
// FULLSCREEN QUAD
// ===============================
const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1
  ]),
  gl.STATIC_DRAW
);
const aPosLoc = gl.getAttribLocation(prog, "aPos");
gl.enableVertexAttribArray(aPosLoc);
gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

// ===============================
// UNIFORMS
// ===============================
const uTimeLoc = gl.getUniformLocation(prog, "uTime");
const uResLoc = gl.getUniformLocation(prog, "uResolution");
const uModeLoc = gl.getUniformLocation(prog, "uMode");
const uQualityLoc = gl.getUniformLocation(prog, "uQuality");

let currentMode = 0;   // default clear
let qualityTier = 1;   // default high

// ===============================
// GPU TIER DETECTION
// ===============================
function detectQualityTier() {
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  let renderer = "";
  if (ext) {
    renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "";
  }

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile) {
    qualityTier = 0; // performance
    return;
  }

  const lowKeywords = ["intel", "uhd", "hd graphics"];
  const highKeywords = ["rtx", "radeon", "rx", "m1", "m2", "m3", "apple"];

  const rLower = renderer.toLowerCase();
  if (highKeywords.some(k => rLower.includes(k))) {
    qualityTier = 2; // ultra
  } else if (lowKeywords.some(k => rLower.includes(k))) {
    qualityTier = 0; // perf
  } else {
    qualityTier = 1; // high
  }
}

detectQualityTier();

// ===============================
// WEATHER MAPPING
// ===============================
function mapCondition(code, isNight) {
  if (isNight) return 5;
  if ([95, 96, 99].includes(code)) return 3;
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 2;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 4;
  if ([2, 3].includes(code)) return 1;
  return 0;
}

function weatherCodeToText(code) {
  const map = {
    0: "Clear Sky",
    1: "Mainly Clear",
    2: "Partly Cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime Fog",
    51: "Light Drizzle",
    53: "Moderate Drizzle",
    55: "Dense Drizzle",
    61: "Light Rain",
    63: "Moderate Rain",
    65: "Heavy Rain",
    71: "Light Snow",
    73: "Moderate Snow",
    75: "Heavy Snow",
    77: "Snow Grains",
    80: "Rain Showers",
    81: "Heavy Showers",
    82: "Violent Showers",
    85: "Snow Showers",
    86: "Heavy Snow Showers",
    95: "Thunderstorm",
    96: "Thunderstorm w/ Hail",
    99: "Severe Thunderstorm"
  };
  return map[code] || "Unknown";
}

// ===============================
// FETCH WEATHER
// ===============================
async function fetchWeather(city) {
  try {
    const geoRes = await fetch(GEO_URL + encodeURIComponent(city));
    const geoData = await geoRes.json();
    if (!geoData.results || geoData.results.length === 0) {
      alert("City not found");
      return;
    }

    const { latitude, longitude, name, country } = geoData.results[0];

    const weatherRes = await fetch(
      `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`
    );
    const weatherData = await weatherRes.json();
    const current = weatherData.current_weather;

    currentMode = mapCondition(current.weathercode, current.is_day === 0);

    cityNameEl.textContent = `${name}, ${country}`;
    tempEl.textContent = `${Math.round(current.temperature)}°F`;
    conditionEl.textContent = weatherCodeToText(current.weathercode);
    detailBoxes[0].textContent = "--";
    detailBoxes[1].textContent = `${Math.round(current.windspeed)} mph`;
    detailBoxes[2].textContent = `${Math.round(current.temperature)}°F`;
  } catch (e) {
    console.error(e);
    alert("Error fetching weather");
  }
}

// ===============================
// INPUT
// ===============================
cityInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const city = cityInput.value.trim();
    if (city) fetchWeather(city);
  }
});

// ===============================
// RENDER LOOP
// ===============================
let startTime = performance.now();

function render() {
  requestAnimationFrame(render);
  const now = performance.now();
  const t = (now - startTime) / 1000;

  gl.useProgram(prog);
  gl.uniform1f(uTimeLoc, t);
  gl.uniform2f(uResLoc, canvas.width, canvas.height);
  gl.uniform1i(uModeLoc, currentMode);
  gl.uniform1i(uQualityLoc, qualityTier);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

render();

// Initial city
fetchWeather("New York");
