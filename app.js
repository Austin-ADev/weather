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
  return localStorage.getItem(UNIT_KEY) || "us";
}
function setUnits(mode) {
  localStorage.setItem(UNIT_KEY, mode);
}
function getUnitParams() {
  const mode = getUnits();
  if (mode === "metric") {
    return {
      temp: "celsius",
      wind: "kmh",
      precip: "mm",
      tempSymbol: "°C",
      windSymbol: "km/h"
    };
  }
  return {
    temp: "fahrenheit",
    wind: "mph",
    precip: "inch",
    tempSymbol: "°F",
    windSymbol: "mph"
  };
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
  } catch {
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
  const units = getUnitParams();
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current_weather=true` +
    `&hourly=temperature_2m,weather_code,relative_humidity_2m,apparent_temperature` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,moon_phase` +
    `&temperature_unit=${units.temp}` +
    `&windspeed_unit=${units.wind}` +
    `&precipitation_unit=${units.precip}` +
    `&timezone=auto`;

  console.log("Fetching weather:", url);

  const res = await fetch(url);
  if (!res.ok) {
    console.error("Weather API error:", res.status, res.statusText);
    throw new Error("Weather fetch failed");
  }
  return res.json();
}

async function geocodeCity(name) {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      name
    )}&count=5&language=en&format=json`;

  console.log("Geocoding:", url);

  const res = await fetch(url);
  if (!res.ok) throw new Error("Geocode failed");
  return res.json();
}

// =========================================================
// SEARCH UI
// =========================================================
function showSearchResults(results) {
  searchResults.innerHTML = "";
  if (!results?.results?.length) {
    searchResults.style.display = "none";
    return;
  }
  results.results.forEach(r => {
    const item = document.createElement("div");
    item.className = "search-item";
    const label = `${r.name}, ${r.admin1 || r.country || ""}`.trim();
    item.textContent = label;
    item.addEventListener("click", () => {
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
    if (timeout) clearTimeout(timeout);
    if (!q) {
      searchResults.style.display = "none";
      return;
    }
    timeout = setTimeout(async () => {
      const geo = await geocodeCity(q);
      showSearchResults(geo);
    }, 250);
  });
}

// =========================================================
// FORECAST BUILDERS
// =========================================================
function buildHourly(hourly, timezone) {
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
  radarFrame.src =
    `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&zoom=5&overlay=radar`;
}

// =========================================================
// UNIT TOGGLE
// =========================================================
function initUnitToggle() {
  function updateLabel() {
    unitToggleBtn.textContent = getUnits() === "us" ? "US" : "Metric";
  }
  updateLabel();
  unitToggleBtn.addEventListener("click", () => {
    const next = getUnits() === "us" ? "metric" : "us";
    setUnits(next);
    updateLabel();
    const label = cityNameEl.textContent;
    if (label && label !== "--") {
      setLocationByName(label);
    }
  });
}

// =========================================================
// TOGGLES
// =========================================================
function initToggles() {
  hourlyToggle.addEventListener("click", () => {
    forecastEl.classList.toggle("open");
    dailyForecastEl.classList.remove("open");
    radarFrame.style.display = "none";
  });
  dailyToggle.addEventListener("click", () => {
    dailyForecastEl.classList.toggle("open");
    forecastEl.classList.remove("open");
    radarFrame.style.display = "none";
  });
  radarToggle.addEventListener("click", () => {
    radarFrame.style.display =
      radarFrame.style.display === "none" ? "block" : "none";
    forecastEl.classList.remove("open");
    dailyForecastEl.classList.remove("open");
  });
}

// =========================================================
// LOCATION HANDLING
// =========================================================
async function setLocationFromCoords(label, lat, lon, timezoneOverride) {
  try {
    const data = await fetchWeather(lat, lon);
    const current = data.current_weather;
    const daily = data.daily;
    const hourly = data.hourly;
    const timezone = data.timezone || timezoneOverride || "UTC";
    const units = getUnitParams();

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
  } catch (e) {
    console.error("Weather error:", e);
  }
}

async function setLocationByName(name) {
  const geo = await geocodeCity(name);
  if (!geo.results?.length) return;
  const r = geo.results[0];
  const label = `${r.name}, ${r.admin1 || r.country || ""}`.trim();
  setLocationFromCoords(label, r.latitude, r.longitude, r.timezone);
}

// =========================================================
// WEBGL SKY — LOADS shaders/sunny.frag
// =========================================================
let gl;
let program;
let uTimeLoc, uResolutionLoc;

async function loadShaderSource(url) {
  const res = await fetch(url + "?v=" + Date.now()); // cache‑buster
  return res.text();
}

function createShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(sh));
    throw new Error("Shader compile failed");
  }
  return sh;
}

async function initSky() {
  gl = canvas.getContext("webgl", { antialias: true });
  if (!gl) {
    alert("WebGL not supported");
    return;
  }

  const vertSrc = `
    attribute vec2 aPos;
    void main() {
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const fragSrc = await loadShaderSource("shaders/sunny.frag");

  const vs = createShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);

  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

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

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener("resize", resize);
  resize();

  const start = performance.now();
  function frame() {
    const t = (performance.now() - start) / 1000;
    gl.uniform1f(uTimeLoc, t);
    gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(frame);
  }
  frame();
}

// =========================================================
// MAIN
// =========================================================
window.addEventListener("DOMContentLoaded", () => {
  initSearch();
  initUnitToggle();
  initToggles();
  initSky();

  // Force initial weather load
  setLocationByName("Indianapolis");
});
