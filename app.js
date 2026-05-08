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
// LOCATION MEMORY (for unit toggle)
// =========================================================
let lastLocation = {
  label: null,
  lat: null,
  lon: null,
  timezone: null
};

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
// WEATHER CODE → HUMAN TEXT
// =========================================================
const WEATHER_TEXT = {
  0: "Clear Sky",
  1: "Mainly Clear",
  2: "Partly Cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime Fog",
  51: "Light Drizzle",
  53: "Moderate Drizzle",
  55: "Dense Drizzle",
  56: "Freezing Drizzle",
  57: "Freezing Drizzle (Dense)",
  61: "Light Rain",
  63: "Moderate Rain",
  65: "Heavy Rain",
  66: "Freezing Rain",
  67: "Freezing Rain (Heavy)",
  71: "Light Snow",
  73: "Moderate Snow",
  75: "Heavy Snow",
  77: "Snow Grains",
  80: "Rain Showers",
  81: "Rain Showers (Moderate)",
  82: "Rain Showers (Violent)",
  85: "Snow Showers",
  86: "Snow Showers (Heavy)",
  95: "Thunderstorm",
  96: "Thunderstorm + Hail",
  99: "Thunderstorm + Heavy Hail"
};

// =========================================================
// TIME
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

// =========================================================
// WEATHER API
// =========================================================
async function fetchWeather(lat, lon) {
  console.log("[DIAG] fetchWeather called with:", lat, lon);

  const units = getUnitParams();

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current_weather=true` +
    `&hourly=temperature_2m,weather_code,relative_humidity_2m,apparent_temperature,cloudcover` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
    `&temperature_unit=${units.temp}` +
    `&windspeed_unit=${units.wind}` +
    `&precipitation_unit=${units.precip}` +
    `&timezone=auto`;

  console.log("[DIAG] WEATHER URL:", url);

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    console.error("[DIAG] NETWORK ERROR:", e);
    return null;
  }

  console.log("[DIAG] Weather response:", res.status, res.statusText);

  const raw = await res.text();

  try {
    const json = JSON.parse(raw);

    if (json.error) {
      console.error("[DIAG] API error payload:", json);
      return null;
    }

    console.log("[DIAG] Weather JSON:", json);
    return json;
  } catch (e) {
    console.error("[DIAG] JSON parse failed:", e);
    console.error("[DIAG] Raw weather response:", raw);
    return null;
  }
}

// =========================================================
// GEOCODER
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
    return { results: [] };
  }

  console.log("[DIAG] Geocode response:", res.status, res.statusText);

  const raw = await res.text();

  try {
    const json = JSON.parse(raw);
    console.log("[DIAG] Geocode JSON:", json);
    return json;
  } catch (e) {
    console.error("[DIAG] JSON parse failed:", e);
    console.error("[DIAG] Raw geocode response:", raw);
    return { results: [] };
  }
}

// =========================================================
// SEARCH UI — RECENT SEARCHES + RESULTS
// =========================================================
const RECENT_KEY = "weather_recent_cities";
const MAX_RECENT = 5;

function loadRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecentSearch(label) {
  let list = loadRecentSearches().filter(x => x !== label);
  list.unshift(label);
  if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

function showRecentSearches() {
  const recentBox = document.getElementById("recentSearches");
  const list = loadRecentSearches();
  recentBox.innerHTML = "";
  if (!list.length) {
    recentBox.style.display = "none";
    return;
  }
  list.forEach(label => {
    const item = document.createElement("div");
    item.className = "search-item";
    item.textContent = label;
    item.addEventListener("click", () => {
      searchInput.value = label;
      recentBox.style.display = "none";
      setLocationByName(label);
    });
    recentBox.appendChild(item);
  });
  recentBox.style.display = "block";
}

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
      document.getElementById("recentSearches").style.display = "none";
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

  searchInput.addEventListener("focus", () => {
    if (!searchInput.value.trim()) {
      showRecentSearches();
      searchResults.style.display = "none";
    }
  });

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim();
    const recentBox = document.getElementById("recentSearches");
    if (timeout) clearTimeout(timeout);

    if (!q) {
      searchResults.style.display = "none";
      showRecentSearches();
      return;
    }

    recentBox.style.display = "none";

    timeout = setTimeout(async () => {
      try {
        const geo = await geocodeCity(q);
        showSearchResults(geo);
      } catch (e) {
        console.error("[DIAG] Geocode error in initSearch:", e);
      }
    }, 300);
  });

  document.addEventListener("click", e => {
    if (!e.target.closest(".search-wrapper")) {
      searchResults.style.display = "none";
      document.getElementById("recentSearches").style.display = "none";
    }
  });
}
// =========================================================
// FAVORITES SYSTEM
// =========================================================
const FAV_KEY = "weather_favorites";

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveFavorites(list) {
  localStorage.setItem(FAV_KEY, JSON.stringify(list));
}

function renderFavorites(currentLabel) {
  const list = loadFavorites();
  const container = document.getElementById("favoritesList");
  const favBtn = document.getElementById("favoriteToggle");
  container.innerHTML = "";

  list.forEach(label => {
    const chip = document.createElement("div");
    chip.className = "fav-chip" + (label === currentLabel ? " active" : "");
    chip.textContent = label;
    chip.addEventListener("click", () => setLocationByName(label));
    container.appendChild(chip);
  });

  const isFav = list.includes(currentLabel);
  favBtn.classList.toggle("active", isFav);
  favBtn.textContent = isFav ? "★" : "☆";
}

function toggleFavorite(currentLabel) {
  if (!currentLabel || currentLabel === "--") return;
  let list = loadFavorites();
  if (list.includes(currentLabel)) {
    list = list.filter(x => x !== currentLabel);
  } else {
    list.push(currentLabel);
  }
  saveFavorites(list);
  renderFavorites(currentLabel);
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
      <div>${WEATHER_TEXT[hourly.weather_code[i]] || "—"}</div>
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
      <div>${WEATHER_TEXT[daily.weather_code[i]] || "—"}</div>
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
// UNIT TOGGLE (PATCHED)
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

    if (lastLocation.label) {
      console.log("[DIAG] Reloading lastLocation after unit change:", lastLocation);
      setLocationFromCoords(
        lastLocation.label,
        lastLocation.lat,
        lastLocation.lon,
        lastLocation.timezone
      );
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
// =========================================================
// WEBGL SKY (continued)
// =========================================================
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

  // Save last location for unit toggle
  lastLocation = {
    label,
    lat,
    lon,
    timezone: timezoneOverride || "UTC"
  };

  const data = await fetchWeather(lat, lon);
  console.log("[DIAG] Weather data received:", data);

  if (!data) {
    console.error("[DIAG] No weather data — aborting UI update");
    return;
  }

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

  const wc = current.weathercode;
  conditionEl.textContent = WEATHER_TEXT[wc] || "Unknown";

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

  // Build UI sections
  buildHourly(hourly, timezone);
  buildDaily(daily);
  setRadar(lat, lon);

  // Shader cloud amount
  if (hourly.cloudcover && hourly.cloudcover.length) {
    currentWeatherAmount = Math.min(1, hourly.cloudcover[0] / 100);
  } else {
    currentWeatherAmount = 0.0;
  }

  console.log("[DIAG] currentWeatherAmount:", currentWeatherAmount);

  // Shader selection
  const shaderName = pickShaderForTimeAndWeather(current, daily);
  await switchShader(shaderName);

  // Save recent search
  saveRecentSearch(label);

  // Update favorites UI
  renderFavorites(label);
}

async function setLocationByName(name) {
  console.log("[DIAG] setLocationByName:", name);

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
}

// =========================================================
// MAIN
// =========================================================
window.addEventListener("DOMContentLoaded", async () => {
  console.log("%c[DIAG] DOMContentLoaded", "color:#0f0;font-weight:bold;");

  initSearch();
  initUnitToggle();
  initToggles();

  // Favorites button
  document.getElementById("favoriteToggle").addEventListener("click", () => {
    toggleFavorite(cityNameEl.textContent);
  });
  renderFavorites("");

  await initSky();
  await switchShader("sunny");

  console.log("[DIAG] Loading default city: Indianapolis");
  setLocationByName("Indianapolis");
});
