// =========================================================
// DIAGNOSTIC app.js — VERBOSE, STEP-BY-STEP LOGGING
// =========================================================
console.log("%c[DIAG] app.js loaded", "color:#0ff;font-weight:bold;");

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
  console.log("[DIAG] getUnits ->", u);
  return u;
}
function setUnits(mode) {
  console.log("[DIAG] setUnits:", mode);
  localStorage.setItem(UNIT_KEY, mode);
}
function getUnitParams() {
  const mode = getUnits();
  const params =
    mode === "metric"
      ? { temp: "celsius", wind: "kmh", precip: "mm", tempSymbol: "°C", windSymbol: "km/h" }
      : { temp: "fahrenheit", wind: "mph", precip: "inch", tempSymbol: "°F", windSymbol: "mph" };
  console.log("[DIAG] getUnitParams ->", params);
  return params;
}

// =========================================================
// TIME + MOON
// =========================================================
function formatTime(dateStr, timezone) {
  console.log("[DIAG] formatTime:", dateStr, timezone);
  try {
    const d = new Date(dateStr);
    const s = d.toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone
    });
    console.log("[DIAG] formatTime result:", s);
    return s;
  } catch (e) {
    console.error("[DIAG] formatTime error:", e);
    return "--:--";
  }
}

function moonPhaseLabel(phase) {
  console.log("[DIAG] moonPhaseLabel input:", phase);
  let label;
  if (phase < 0.03 || phase > 0.97) label = "New Moon";
  else if (phase < 0.22) label = "Waxing Crescent";
  else if (phase < 0.28) label = "First Quarter";
  else if (phase < 0.47) label = "Waxing Gibbous";
  else if (phase < 0.53) label = "Full Moon";
  else if (phase < 0.72) label = "Waning Gibbous";
  else if (phase < 0.78) label = "Last Quarter";
  else label = "Waning Crescent";
  console.log("[DIAG] moonPhaseLabel ->", label);
  return label;
}

// =========================================================
// WEATHER API (FINAL MERGED ENGINE)
// =========================================================
async function fetchWeather(lat, lon) {
  console.log("[DIAG] fetchWeather called with:", lat, lon);
  if (lat == null || lon == null) {
    console.error("[DIAG] ERROR: fetchWeather got invalid lat/lon:", lat, lon);
  }

  const units = getUnitParams();

  async function tryFetch(base) {
    const url =
      `${base}/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current_weather=true` +
      `&hourly=temperature_2m,weather_code,relative_humidity_2m,apparent_temperature,cloudcover` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,moon_phase,sunrise,sunset` +
      `&temperature_unit=${units.temp}` +
      `&windspeed_unit=${units.wind}` +
      `&precipitation_unit=${units.precip}` +
      `&timezone=auto`;

    console.log("[DIAG] TRY WEATHER URL:", url);

    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      console.error("[DIAG] NETWORK ERROR fetching weather from", base, e);
      return null;
    }

    console.log("[DIAG] Weather response from", base, ":", res.status, res.statusText);

    const raw = await res.text();

    try {
      const json = JSON.parse(raw);

      if (json.error) {
        console.error("[DIAG] API error payload from", base, ":", json);
        return null;
      }

      if (!json.daily) json.daily = {};
      if (!Array.isArray(json.daily.moon_phase)) {
        console.warn("[DIAG] moon_phase missing or invalid, patching to [0]");
        json.daily.moon_phase = [0];
      }

      console.log("[DIAG] Weather JSON from", base, ":", json);
      return json;
    } catch (e) {
      console.error("[DIAG] JSON parse failed for", base, e);
      console.error("[DIAG] Raw weather response from", base, ":", raw);
      return null;
    }
  }

  let data = await tryFetch("https://api.open-meteo.com");
  if (data) return data;

  data = await tryFetch("https://open-meteo.com");
  if (data) return data;

  console.error("[DIAG] All weather APIs failed — using safe fallback");

  const nowIso = new Date().toISOString();
  return {
    current_weather: {
      temperature: 0,
      weathercode: 0,
      windspeed: 0,
      time: nowIso
    },
    hourly: {
      temperature_2m: [0],
      relative_humidity_2m: [0],
      apparent_temperature: [0],
      cloudcover: [0],
      time: [nowIso]
    },
    daily: {
      temperature_2m_max: [0],
      temperature_2m_min: [0],
      weather_code: [0],
      moon_phase: [0],
      sunrise: [nowIso],
      sunset: [nowIso]
    },
    timezone: "UTC"
  };
}

// =========================================================
// GEOCODER (PATCHED)
// =========================================================
async function geocodeCity(name) {
  console.log("[DIAG] geocodeCity called with:", name);

  const url =
    "https://geocoding-api.open-meteo.com/v1/search" +
    `?name=${encodeURIComponent(name)}` +
    "&count=5&language=en&format=json";

  console.log("[DIAG] GEOCODE URL:", url);

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    console.error("[DIAG] NETWORK ERROR fetching geocode:", e);
    throw e;
  }

  console.log("[DIAG] Geocode response:", res.status, res.statusText);

  const raw = await res.text();

  try {
    const json = JSON.parse(raw);
    console.log("[DIAG] Geocode JSON:", json);
    return json;
  } catch (e) {
    console.error("[DIAG] JSON parse failed in geocodeCity:", e);
    console.error("[DIAG] Raw geocode response:", raw);
    return { results: [] };
  }
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
      console.log("[DIAG] Search item clicked:", label, r.latitude, r.longitude);
      searchResults.style.display = "none";
      searchInput.value = label;
      setLocationFromCoords(label, r.latitude, r.longitude, r.timezone);
    });
    searchResults.appendChild(item);
  });
  searchResults.style.display = "block";
}

function initSearch() {
  console.log("[DIAG] initSearch called");
  let timeout = null;
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim();
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
        console.error("[DIAG] Geocode error in initSearch:", e);
      }
    }, 300);
  });
}

// =========================================================
// FORECAST BUILDERS
// =========================================================
function buildHourly(hourly, timezone) {
  console.log("[DIAG] buildHourly called");
  forecastEl.innerHTML = "";
  const units = getUnitParams();
  if (!hourly || !hourly.time) {
    console.warn("[DIAG] buildHourly: no hourly data");
    return;
  }
  for (let i = 0; i < 24 && i < hourly.time.length; i++) {
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
  console.log("[DIAG] buildDaily called");
  dailyForecastEl.innerHTML = "";
  const units = getUnitParams();
  if (!daily || !daily.time) {
    console.warn("[DIAG] buildDaily: no daily data");
    return;
  }
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
  console.log("[DIAG] setRadar:", lat, lon);
  radarFrame.src =
    `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&zoom=5&overlay=radar`;
}

// =========================================================
// UNIT TOGGLE
// =========================================================
function initUnitToggle() {
  console.log("[DIAG] initUnitToggle called");
  function updateLabel() {
    unitToggleBtn.textContent = getUnits() === "us" ? "US" : "Metric";
  }
  updateLabel();
  unitToggleBtn.addEventListener("click", () => {
    const next = getUnits() === "us" ? "metric" : "us";
    console.log("[DIAG] unitToggle clicked, new mode:", next);
    setUnits(next);
    updateLabel();
    const label = cityNameEl.textContent;
    if (label && label !== "--") {
      console.log("[DIAG] Reloading location after unit change:", label);
      setLocationByName(label);
    }
  });
}

// =========================================================
// TOGGLES
// =========================================================
function initToggles() {
  console.log("[DIAG] initToggles called");

  hourlyToggle.addEventListener("click", () => {
    const isOpen = forecastEl.classList.toggle("open");
    console.log("[DIAG] hourlyToggle clicked, open:", isOpen);
    if (isOpen) {
      dailyForecastEl.classList.remove("open");
      radarFrame.style.display = "none";
    }
  });

  dailyToggle.addEventListener("click", () => {
    const isOpen = dailyForecastEl.classList.toggle("open");
    console.log("[DIAG] dailyToggle clicked, open:", isOpen);
    if (isOpen) {
      forecastEl.classList.remove("open");
      radarFrame.style.display = "none";
    }
  });

  radarToggle.addEventListener("click", () => {
    const showing = radarFrame.style.display === "block";
    const next = !showing;
    console.log("[DIAG] radarToggle clicked, showing:", next);
    radarFrame.style.display = next ? "block" : "none";
    if (next) {
      forecastEl.classList.remove("open");
      dailyForecastEl.classList.remove("open");
    }
  });
}

// =========================================================
// SHADER SELECTION
// =========================================================
function pickShaderForTimeAndWeather(current, daily) {
  console.log("[DIAG] pickShaderForTimeAndWeather:", current, daily);
  try {
    if (
      !current ||
      !current.time ||
      !daily ||
      !daily.sunrise ||
      !daily.sunrise.length ||
      !daily.sunset ||
      !daily.sunset.length
    ) {
      console.warn("[DIAG] pickShader: missing time/sunrise/sunset, defaulting to sunny");
      return "sunny";
    }

    const now = new Date(current.time).getTime();
    const sunrise = new Date(daily.sunrise[0]).getTime();
    const sunset = new Date(daily.sunset[0]).getTime();

    let result;
    if (now < sunrise + 45 * 60 * 1000) result = "sunrise";
    else if (now > sunset - 45 * 60 * 1000) result = "sunset";
    else if (now > sunset || now < sunrise) result = "night";
    else result = "sunny";

    console.log("[DIAG] pickShader result:", result);
    return result;
  } catch (e) {
    console.error("[DIAG] pickShaderForTimeAndWeather error:", e);
    return "sunny";
  }
}

// =========================================================
// WEBGL SKY
// =========================================================
let gl;
let program;
let uTimeLoc, uResolutionLoc, uWeatherLoc;
let currentShaderName = null;
let currentWeatherAmount = 0.0;

async function loadShaderSource(url) {
  console.log("[DIAG] loadShaderSource:", url);
  const res = await fetch(url + "?v=" + Date.now());
  console.log("[DIAG] Shader fetch status:", res.status, res.statusText);
  if (!res.ok) {
    console.error("[DIAG] Shader fetch failed:", url);
  }
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

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("[DIAG] Program link error:", gl.getProgramInfoLog(prog));
  }

  return prog;
}

async function switchShader(name) {
  console.log("[DIAG] switchShader requested:", name);
  if (name === currentShaderName) {
    console.log("[DIAG] switchShader: already using", name);
    return;
  }

  const newProgram = await loadSkyShader(name);
  program = newProgram;
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

  currentShaderName = name;
}

async function initSky() {
  console.log("[DIAG] initSky called");
  gl = canvas.getContext("webgl", { antialias: true });
  if (!gl) {
    console.error("[DIAG] WebGL not supported");
    return;
  }

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
    if (uTimeLoc && uResolutionLoc && uWeatherLoc) {
      gl.uniform1f(uTimeLoc, t);
      gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
      gl.uniform1f(uWeatherLoc, currentWeatherAmount);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(frame);
  }
  frame();
}

// =========================================================
// LOCATION HANDLING
// =========================================================
async function setLocationFromCoords(label, lat, lon, timezoneOverride) {
  console.log("[DIAG] setLocationFromCoords:", label, lat, lon, timezoneOverride);
  if (lat == null || lon == null) {
    console.error("[DIAG] ERROR: setLocationFromCoords got invalid lat/lon");
  }

  try {
    const data = await fetchWeather(lat, lon);
    console.log("[DIAG] Weather data received:", data);

    const current = data.current_weather || {};
    const daily = data.daily || {};
    const hourly = data.hourly || {};
    const timezone = data.timezone || timezoneOverride || "UTC";
    const units = getUnitParams();

    cityNameEl.textContent = label;
    localtimeEl.textContent = current.time ? formatTime(current.time, timezone) : "--:--";
    tempEl.textContent =
      typeof current.temperature === "number"
        ? `${Math.round(current.temperature)}${units.tempSymbol}`
        : `--${units.tempSymbol}`;
    conditionEl.textContent = `Code ${current.weathercode ?? "--"}`;
    humidityEl.textContent =
      hourly.relative_humidity_2m && hourly.relative_humidity_2m.length
        ? `${Math.round(hourly.relative_humidity_2m[0])}%`
        : "--%";
    windEl.textContent =
      typeof current.windspeed === "number"
        ? `${Math.round(current.windspeed)} ${units.windSymbol}`
        : `-- ${units.windSymbol}`;
    feelsEl.textContent =
      hourly.apparent_temperature && hourly.apparent_temperature.length
        ? `${Math.round(hourly.apparent_temperature[0])}${units.tempSymbol}`
        : `--${units.tempSymbol}`;
    moonLabelEl.textContent =
      daily.moon_phase && daily.moon_phase.length
        ? moonPhaseLabel(daily.moon_phase[0])
        : "--";

    buildHourly(hourly, timezone);
    buildDaily(daily);
    setRadar(lat, lon);

    if (hourly.cloudcover && hourly.cloudcover.length) {
      currentWeatherAmount = Math.min(1, hourly.cloudcover[0] / 100);
    } else {
      currentWeatherAmount = 0.0;
    }
    console.log("[DIAG] currentWeatherAmount:", currentWeatherAmount);

    const shaderName = pickShaderForTimeAndWeather(current, daily);
    await switchShader(shaderName);

  } catch (e) {
    console.error("[DIAG] Weather error in setLocationFromCoords:", e);
  }
}

async function setLocationByName(name) {
  console.log("[DIAG] setLocationByName:", name);
  try {
    const geo = await geocodeCity(name);
    console.log("[DIAG] Geocode result:", geo);
    if (!geo.results?.length) {
      console.error("[DIAG] No geocode results for:", name);
      return;
    }
    const r = geo.results[0];
    const label = `${r.name}, ${r.admin1 || r.country || ""}`.trim();
    console.log("[DIAG] Using geocode:", label, r.latitude, r.longitude, r.timezone);
    setLocationFromCoords(label, r.latitude, r.longitude, r.timezone);
  } catch (e) {
    console.error("[DIAG] setLocationByName error:", e);
  }
}

// =========================================================
// MAIN
// =========================================================
window.addEventListener("DOMContentLoaded", async () => {
  console.log("%c[DIAG] DOMContentLoaded", "color:#0f0;font-weight:bold;");

  initSearch();
  initUnitToggle();
  initToggles();

  await initSky();
  await switchShader("sunny");

  console.log("[DIAG] Loading default city: Indianapolis");
  setLocationByName("Indianapolis");
});
