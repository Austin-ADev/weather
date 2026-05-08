// =========================================================
// DIAGNOSTIC MODE ENABLED
// =========================================================
console.log("%c[DIAGNOSTIC] app.js loaded", "color:#0ff;font-weight:bold;");

// =========================================================
// DOM ELEMENTS
// =========================================================
const canvas = document.getElementById("sky");

const cityNameEl = document.getElementById("cityName");
const localtimeEl = document.getElementById("localtime");
const conditionEl = document.getElementById("condition");
const tempEl = document.getElementById("temp");
const humidityEl = document.getElementById("humidity");
const windEl = document.getElementById("wind");
const feelsEl = document.getElementById("feels");
const moonLabelEl = document.getElementById("moonLabel");

const forecastEl = document.getElementById("forecast");
const dailyForecastEl = document.getElementById("dailyForecast");
const radarFrame = document.getElementById("radarFrame");

const hourlyToggle = document.getElementById("hourlyToggle");
const dailyToggle = document.getElementById("dailyToggle");
const radarToggle = document.getElementById("radarToggle");

const searchInput = document.getElementById("citySearch");
const searchResults = document.getElementById("searchResults");
const unitToggleBtn = document.getElementById("unitToggle");

// =========================================================
// UNITS
// =========================================================
const UNIT_KEY = "weather_units";

function getUnits() {
  const u = localStorage.getItem(UNIT_KEY) || "us";
  console.log("[DIAG] Units:", u);
  return u;
}
function setUnits(mode) {
  console.log("[DIAG] Setting units:", mode);
  localStorage.setItem(UNIT_KEY, mode);
}
function getUnitParams() {
  const mode = getUnits();
  return mode === "metric"
    ? { temp: "celsius", wind: "kmh", precip: "mm", tempSymbol: "°C", windSymbol: "km/h" }
    : { temp: "fahrenheit", wind: "mph", precip: "inch", tempSymbol: "°F", windSymbol: "mph" };
}

// =========================================================
// TIME + MOON
// =========================================================
function formatTime(dateStr, timezone) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone
    });
  } catch (e) {
    console.error("[DIAG] Time format error:", e);
    return "--:--";
  }
}

function moonPhaseLabel(phase) {
  if (phase < 0.03 || phase > 0.97) return "New Moon";
  if (phase < 0.22) return "Waxing Crescent";
  if (phase < 0.28) return "First Quarter";
  if (phase < 0.47) return "Waxing Gibbous";
  if (phase < 0.53) return "Full Moon";
  if (phase < 0.72) return "Waning Gibbous";
  if (phase < 0.78) return "Last Quarter";
  return "Waning Crescent";
}

// =========================================================
// WEATHER API
// =========================================================
async function fetchWeather(lat, lon) {
  console.log("[DIAG] fetchWeather() called with:", lat, lon);

  if (!lat || !lon) {
    console.error("[DIAG] ERROR: fetchWeather() received undefined lat/lon");
  }

  const units = getUnitParams();
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current_weather=true` +
    `&hourly=temperature_2m,weather_code,relative_humidity_2m,apparent_temperature,cloudcover` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,moon_phase,sunrise,sunset` +
    `&temperature_unit=${units.temp}` +
    `&windspeed_unit=${units.wind}` +
    `&precipitation_unit=${units.precip}` +
    `&timezone=auto`;

  console.log("[DIAG] WEATHER URL:", url);

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    console.error("[DIAG] NETWORK ERROR fetching weather:", e);
    throw e;
  }

  console.log("[DIAG] Weather response status:", res.status, res.statusText);

  if (!res.ok) {
    console.error("[DIAG] Weather API error body:", await res.text());
    throw new Error("Weather fetch failed");
  }

  const json = await res.json();
  console.log("[DIAG] Weather JSON:", json);
  return json;
}

async function geocodeCity(name) {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      name
    )}&count=5&language=en&format=json`;

  console.log("[DIAG] GEOCODE URL:", url);

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    console.error("[DIAG] NETWORK ERROR fetching geocode:", e);
    throw e;
  }

  console.log("[DIAG] Geocode response:", res.status, res.statusText);

  if (!res.ok) {
    console.error("[DIAG] Geocode error body:", await res.text());
    throw new Error("Geocode failed");
  }

  const json = await res.json();
  console.log("[DIAG] Geocode JSON:", json);
  return json;
}

// =========================================================
// SEARCH UI
// =========================================================
function showSearchResults(results) {
  console.log("[DIAG] showSearchResults:", results);

  searchResults.innerHTML = "";
  if (!results?.results?.length) {
    console.warn("[DIAG] No geocode results");
    searchResults.style.display = "none";
    return;
  }
  results.results.forEach(r => {
    const item = document.createElement("div");
    item.className = "search-item";
    const label = `${r.name}, ${r.admin1 || r.country || ""}`.trim();
    item.textContent = label;
    item.addEventListener("click", () => {
      console.log("[DIAG] User selected:", label, r.latitude, r.longitude);
      searchResults.style.display = "none";
      searchInput.value = label;
      setLocationFromCoords(label, r.latitude, r.longitude, r.timezone);
    });
    searchResults.appendChild(item);
  });
  searchResults.style.display = "block";
}

function initSearch() {
  let timeout = null;
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim();
    console.log("[DIAG] Search input:", q);

    if (timeout) clearTimeout(timeout);
    if (!q) {
      searchResults.style.display = "none";
      return;
    }
    timeout = setTimeout(async () => {
      try {
        const geo = await geocodeCity(q);
        showSearchResults(geo);
      } catch (e) {
        console.error("[DIAG] Geocode error:", e);
      }
    }, 250);
  });
}

// =========================================================
// FORECAST BUILDERS
// =========================================================
function buildHourly(hourly, timezone) {
  console.log("[DIAG] Building hourly forecast");
  forecastEl.innerHTML = "";
  const units = getUnitParams();
  for (let i = 0; i < 24; i++) {
    const row = document.createElement("div");
    row.className = "forecast-hour";
    row.innerHTML = `
      <div>${formatTime(hourly.time[i], timezone)}</div>
      <div>${Math.round(hourly.temperature_2m[i])}${units.tempSymbol}</div>
      <div>${hourly.weather_code[i]}</div>
    `;
    forecastEl.appendChild(row);
  }
}

function buildDaily(daily) {
  console.log("[DIAG] Building daily forecast");
  dailyForecastEl.innerHTML = "";
  const units = getUnitParams();
  for (let i = 0; i < daily.time.length; i++) {
    const row = document.createElement("div");
    row.className = "daily-row";
    const date = new Date(daily.time[i]).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric"
    });
    row.innerHTML = `
      <div>${date}</div>
      <div>${Math.round(daily.temperature_2m_max[i])}${units.tempSymbol} /
           ${Math.round(daily.temperature_2m_min[i])}${units.tempSymbol}</div>
      <div>${daily.weather_code[i]}</div>
    `;
    dailyForecastEl.appendChild(row);
  }
}

// =========================================================
// RADAR
// =========================================================
function setRadar(lat, lon) {
  console.log("[DIAG] Setting radar:", lat, lon);
  radarFrame.src =
    `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&zoom=5&overlay=radar`;
}

// =========================================================
// SHADER SELECTION
// =========================================================
function pickShaderForTimeAndWeather(current, daily) {
  console.log("[DIAG] pickShaderForTimeAndWeather:", current, daily);

  const now = new Date(current.time).getTime();
  const sunrise = new Date(daily.sunrise[0]).getTime();
  const sunset = new Date(daily.sunset[0]).getTime();

  if (now < sunrise + 45 * 60 * 1000) return "sunrise";
  if (now > sunset - 45 * 60 * 1000) return "sunset";
  if (now > sunset || now < sunrise) return "night";
  return "sunny";
}

// =========================================================
// WEBGL SKY
// =========================================================
let gl;
let program;
let uTimeLoc, uResolutionLoc, uWeatherLoc;

async function loadShaderSource(url) {
  console.log("[DIAG] Loading shader:", url);
  const res = await fetch(url + "?v=" + Date.now());
  if (!res.ok) console.error("[DIAG] Shader load error:", res.status, res.statusText);
  return res.text();
}

function createShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("[DIAG] Shader compile error:", gl.getShaderInfoLog(sh));
    throw new Error("Shader compile failed");
  }
  return sh;
}

async function loadSkyShader(name) {
  console.log("[DIAG] loadSkyShader:", name);

  const fragSrc = await loadShaderSource(`shaders/${name}.frag`);

  const vertSrc = `
    attribute vec2 aPos;
    void main() {
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const vs = createShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);

  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("[DIAG] Program link error:", gl.getProgramInfoLog(program));
  }

  gl.useProgram(program);

  const quad = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1
  ]);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

  const aPosLoc = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPosLoc);
  gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

  uTimeLoc = gl.getUniformLocation(program, "uTime");
  uResolutionLoc = gl.getUniformLocation(program, "uResolution");
  uWeatherLoc = gl.getUniformLocation(program, "uWeather");

  console.log("[DIAG] Shader uniforms:", { uTimeLoc, uResolutionLoc, uWeatherLoc });
}

async function initSky(shaderName) {
  console.log("[DIAG] initSky:", shaderName);

  if (!gl) {
    gl = canvas.getContext("webgl", { antialias: true });
    if (!gl) {
      console.error("[DIAG] WebGL not supported");
      return;
    }
  }

  await loadSkyShader(shaderName);

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
    console.log("[DIAG] Canvas resized:", canvas.width, canvas.height);
  }
  window.addEventListener("resize", resize);
  resize();

  const start = performance.now();
  function frame() {
    const t = (performance.now() - start) / 1000;
    gl.uniform1f(uTimeLoc, t);
    gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
    gl.uniform1f(uWeatherLoc, currentWeatherAmount);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(frame);
  }
  frame();
}

// =========================================================
// LOCATION HANDLING
// =========================================================
let currentWeatherAmount = 0.0;

async function setLocationFromCoords(label, lat, lon, timezoneOverride) {
  console.log("[DIAG] setLocationFromCoords:", label, lat, lon);

  if (!lat || !lon) {
    console.error("[DIAG] ERROR: setLocationFromCoords got undefined lat/lon");
  }

  try {
    const data = await fetchWeather(lat, lon);
    const current = data.current_weather;
    const daily = data.daily;
    const hourly = data.hourly;
    const timezone = data.timezone || timezoneOverride || "UTC";
    const units = getUnitParams();

    console.log("[DIAG] Weather data:", data);

    cityNameEl.textContent = label;
    localtimeEl.textContent = formatTime(current.time, timezone);
    tempEl.textContent = `${Math.round(current.temperature)}${units.tempSymbol}`;
    conditionEl.textContent = `Code ${current.weathercode}`;
    humidityEl.textContent = `${Math.round(hourly.relative_humidity_2m[0])}%`;
    windEl.textContent = `${Math.round(current.windspeed)} ${units.windSymbol}`;
    feelsEl.textContent = `${Math.round(hourly.apparent_temperature[0])}${units.tempSymbol}`;
    moonLabelEl.textContent = moonPhaseLabel(daily.moon_phase[0]);

    buildHourly(hourly, timezone);
    buildDaily(daily);
    setRadar(lat, lon);

    currentWeatherAmount = Math.min(1, hourly.cloudcover[0] / 100);
    console.log("[DIAG] Cloud amount:", currentWeatherAmount);

    const shaderName = pickShaderForTimeAndWeather(current, daily);
    console.log("[DIAG] Selected shader:", shaderName);

    await initSky(shaderName);

  } catch (e) {
    console.error("[DIAG] Weather error:", e);
  }
}

async function setLocationByName(name) {
  console.log("[DIAG] setLocationByName:", name);

  const geo = await geocodeCity(name);
  console.log("[DIAG] Geocode result:", geo);

  if (!geo.results?.length) {
    console.error("[DIAG] ERROR: No geocode results for:", name);
    return;
  }

  const r = geo.results[0];
  const label = `${r.name}, ${r.admin1 || r.country || ""}`.trim();

  console.log("[DIAG] Using geocode:", label, r.latitude, r.longitude);

  setLocationFromCoords(label, r.latitude, r.longitude, r.timezone);
}

// =========================================================
// MAIN
// =========================================================
window.addEventListener("DOMContentLoaded", () => {
  console.log("%c[DIAGNOSTIC] DOMContentLoaded", "color:#0f0;font-weight:bold;");

  initSearch();
  initUnitToggle();
  initToggles();

  console.log("[DIAG] Loading default city: Indianapolis");
  setLocationByName("Indianapolis");
});
