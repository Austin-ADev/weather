// =========================================================
// DIAGNOSTIC
// =========================================================
console.log("%c[APP] app.js loaded", "color:#0ff;font-weight:bold;");

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

const searchInput = document.getElementById("citySearch");
const searchResults = document.getElementById("searchResults");
const unitToggleBtn = document.getElementById("unitToggle");

// =========================================================
// LOCATION MEMORY
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
  return localStorage.getItem(UNIT_KEY) || "us";
}

function setUnits(mode) {
  localStorage.setItem(UNIT_KEY, mode);
}

function getUnitParams() {
  const mode = getUnits();
  return mode === "metric"
    ? { temp: "celsius", wind: "kmh", precip: "mm", tempSymbol: "°C", windSymbol: "km/h" }
    : { temp: "fahrenheit", wind: "mph", precip: "inch", tempSymbol: "°F", windSymbol: "mph" };
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
  try {
    const d = new Date(dateStr + ":00"); // force seconds
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone
    });
  } catch (err) {
    console.warn("[TIME] Failed to format:", err);
    return "--:--";
  }
}

// =========================================================
// WEATHER API
// =========================================================
async function fetchWeather(lat, lon) {
  console.log("[API] Fetching weather for", lat, lon);

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

  try {
    const res = await fetch(url);
    const raw = await res.text();
    return JSON.parse(raw);
  } catch (err) {
    console.error("[API] Weather fetch failed:", err);
    return null;
  }
}

// =========================================================
// GEOCODER
// =========================================================
async function geocodeCity(name) {
  console.log("[GEO] Searching:", name);

  const url =
    "https://geocoding-api.open-meteo.com/v1/search" +
    `?name=${encodeURIComponent(name)}` +
    "&count=5&language=en&format=json";

  try {
    const res = await fetch(url);
    const raw = await res.text();
    return JSON.parse(raw);
  } catch (err) {
    console.error("[GEO] Failed:", err);
    return { results: [] };
  }
}

// =========================================================
// RECENT SEARCHES
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
    item.innerHTML = `<span>${label}</span><span class="search-star">☆</span>`;
    item.addEventListener("click", () => {
      searchInput.value = label;
      recentBox.style.display = "none";
      setLocationByName(label);
    });
    item.querySelector(".search-star").addEventListener("click", e => {
      e.stopPropagation();
      toggleFavorite(label);
    });
    recentBox.appendChild(item);
  });
  recentBox.style.display = "block";
}

// =========================================================
// SEARCH RESULTS
// =========================================================
function showSearchResults(results) {
  searchResults.innerHTML = "";
  if (!results?.results?.length) {
    searchResults.style.display = "none";
    return;
  }

  results.results.forEach(r => {
    const label = `${r.name}, ${r.admin1 || r.country || ""}`.trim();
    const item = document.createElement("div");
    item.className = "search-item";
    item.innerHTML = `<span>${label}</span><span class="search-star">☆</span>`;

    item.addEventListener("click", () => {
      searchResults.style.display = "none";
      document.getElementById("recentSearches").style.display = "none";
      searchInput.value = "";
      setLocationFromCoords(label, r.latitude, r.longitude, r.timezone);
    });

    item.querySelector(".search-star").addEventListener("click", e => {
      e.stopPropagation();
      toggleFavorite(label);
    });

    searchResults.appendChild(item);
  });

  searchResults.style.display = "block";
}

// =========================================================
// SEARCH INPUT HANDLER
// =========================================================
function initSearch() {
  let timeout = null;

  searchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const q = searchInput.value.trim();
      if (q) setLocationByName(q);
      searchInput.value = "";
      searchResults.style.display = "none";
      document.getElementById("recentSearches").style.display = "none";
    }
  });

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
      const geo = await geocodeCity(q);
      showSearchResults(geo);
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

    chip.addEventListener("click", async () => {
      console.log("[FAV] Switching to:", label);
      await setLocationByName(label);
    });

    container.appendChild(chip);
  });

  const isFav = list.includes(currentLabel);
  favBtn.classList.toggle("active", isFav);
  favBtn.textContent = isFav ? "★" : "☆";
}

function toggleFavorite(label) {
  if (!label || label.trim() === "") return;

  let list = loadFavorites();
  if (list.includes(label)) {
    list = list.filter(x => x !== label);
  } else {
    list.push(label);
  }
  saveFavorites(list);
  renderFavorites(label);
}

// =========================================================
// FORECAST BUILDERS
// =========================================================
function buildHourly(hourly, timezone) {
  forecastEl.innerHTML = "";
  const units = getUnitParams();

  if (!hourly || !hourly.time) return;

  // 1. Determine current hour in target timezone
  const now = new Date().toLocaleString("en-US", { timeZone: timezone });
  const currentHour = new Date(now).getHours();

  // 2. Find index of current hour
  let startIndex = hourly.time.findIndex(t => {
    const d = new Date(t);
    return d.getHours() === currentHour;
  });

  if (startIndex < 0) startIndex = 0;

  // 3. Slice next 24 hours
  const endIndex = Math.min(startIndex + 24, hourly.time.length);

  const temps = [];
  const labels = [];
  const conditions = [];

  for (let i = startIndex; i < endIndex; i++) {
    const t = new Date(hourly.time[i]);
    const hour = t.toLocaleTimeString([], { hour: "numeric" });

    temps.push(hourly.temperature_2m[i]);
    labels.push(hour);
    conditions.push(WEATHER_TEXT[hourly.weather_code[i]] || "—");

    const row = document.createElement("div");
    row.className = "forecast-hour";

    row.innerHTML = `
      <div>${hour}</div>
      <div>${Math.round(hourly.temperature_2m[i])}${units.tempSymbol}</div>
      <div>${WEATHER_TEXT[hourly.weather_code[i]] || "—"}</div>
    `;

    forecastEl.appendChild(row);
  }

  drawHourlyChart(temps, labels, units.tempSymbol, conditions);
  setupHourlyHover(temps, labels, conditions, units.tempSymbol);
}


// CHART DRAWING
function drawHourlyChart(temps, labels, symbol, conditions) {
  const canvas = document.getElementById("hourlyChart");
  const ctx = canvas.getContext("2d");

  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim() || "#4fd1ff";

  const hourWidth = 80; // MUST MATCH forecast-hour width
  const totalWidth = hourWidth * temps.length;

  canvas.width = totalWidth;
  canvas.height = 120;

  const w = canvas.width;
  const h = canvas.height;

  const max = Math.max(...temps);
  const min = Math.min(...temps);

  const pad = 20;

  ctx.clearRect(0, 0, w, h);

  // -----------------------------
  // Temperature line (aligned to boxes)
  // -----------------------------
  ctx.beginPath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = accent;

  const points = [];

  temps.forEach((t, i) => {
    // CENTER OF EACH HOURLY BOX
    const x = i * hourWidth + hourWidth / 2;
    const y = h - pad - ((t - min) / (max - min)) * (h - pad * 2);

    points.push({ x, y });

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  // -----------------------------
  // High marker
  // -----------------------------
  const hiIndex = temps.indexOf(max);
  ctx.fillStyle = "#bd1818";
  ctx.beginPath();
  ctx.arc(points[hiIndex].x, points[hiIndex].y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillText(`High: ${Math.round(max)}${symbol}`, points[hiIndex].x + 8, points[hiIndex].y - 8);

  // -----------------------------
  // Low marker
  // -----------------------------
  const loIndex = temps.indexOf(min);
  ctx.fillStyle = "#183eb9fa";
  ctx.beginPath();
  ctx.arc(points[loIndex].x, points[loIndex].y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillText(`Low: ${Math.round(min)}${symbol}`, points[loIndex].x + 8, points[loIndex].y + 14);

  // Save points for hover dot
  canvas._chartPoints = points;
  canvas._hourWidth = hourWidth;
}

// HOVER SYSTEM (with hover dot)
function setupHourlyHover(temps, labels, conditions, symbol) {
  const scroll = document.getElementById("hourlyScroll");
  const tooltip = document.getElementById("hourlyTooltip");
  const canvas = document.getElementById("hourlyChart");
  const ctx = canvas.getContext("2d");

  const points = canvas._chartPoints;
  const hourWidth = canvas._hourWidth;

  scroll.onmousemove = (e) => {
    const rect = scroll.getBoundingClientRect();
    const xInScroll = e.clientX - rect.left;
    const worldX = scroll.scrollLeft + xInScroll;

    // -----------------------------
    // 1. Find the two points around the cursor
    // -----------------------------
    let i = Math.floor(worldX / hourWidth);
    if (i < 0 || i >= points.length - 1) {
      tooltip.style.opacity = 0;
      drawHourlyChart(temps, labels, symbol, conditions);
      return;
    }

    const p1 = points[i];
    const p2 = points[i + 1];

    // -----------------------------
    // 2. Interpolate Y between p1 and p2
    // -----------------------------
    const t = (worldX - p1.x) / (p2.x - p1.x);
    const interpX = worldX;
    const interpY = p1.y + (p2.y - p1.y) * t;

    // -----------------------------
    // 3. Check if cursor is close to the line
    // -----------------------------
    const mouseY = e.clientY - rect.top;
    const dist = Math.abs(mouseY - interpY);

    if (dist > 25) {
      // Too far from the line → hide dot + tooltip
      tooltip.style.opacity = 0;
      drawHourlyChart(temps, labels, symbol, conditions);
      return;
    }

    // -----------------------------
    // 4. Determine which hour segment we’re in
    // -----------------------------
    const hourIndex = Math.floor(worldX / hourWidth);

    // -----------------------------
    // 5. Tooltip content
    // -----------------------------
    tooltip.innerHTML = `
      <strong>${labels[hourIndex]}</strong><br>
      ${Math.round(temps[hourIndex])}${symbol}<br>
      ${conditions[hourIndex]}
    `;

    tooltip.style.opacity = 1;
    tooltip.style.left = (interpX - scroll.scrollLeft) + "px";
    tooltip.style.top = (interpY - 20) + "px";

    // -----------------------------
    // 6. Draw hover dot at interpolated point
    // -----------------------------
    drawHourlyChart(temps, labels, symbol, conditions); // redraw clean

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(interpX, interpY, 5, 0, Math.PI * 2);
    ctx.fill();
  };

  scroll.onmouseleave = () => {
    tooltip.style.opacity = 0;
    drawHourlyChart(temps, labels, symbol, conditions);
  };
}


// DAILY FORECAST
function buildDaily(daily) {
  dailyForecastEl.innerHTML = "";
  const units = getUnitParams();

  if (!daily || !daily.time) return;

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
// RADAR ALWAYS VISIBLE
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

    if (lastLocation.label) {
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
// SHADER SYSTEM
// =========================================================
let gl;
let program;
let uTimeLoc, uResolutionLoc, uWeatherLoc, uDayPhaseLoc;
let currentShaderName = null;
let currentWeatherAmount = 0.0;
let currentDayPhase = 0.5;

async function loadShaderSource(url) {
  try {
    const res = await fetch(url + "?v=" + Date.now());
    return await res.text();
  } catch (err) {
    console.error("[SHADER] Failed to load:", url, err);
    return "";
  }
}

function createShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);

  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("[SHADER] Compile error:", gl.getShaderInfoLog(sh));
    console.log("---- Shader Source ----\n" + src);
    throw new Error("Shader compile failed");
  }
  return sh;
}

async function loadSkyShader(name) {
  console.log("[SHADER] Loading shader:", name);

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
    console.error("[SHADER] Link error:", gl.getProgramInfoLog(prog));
    throw new Error("Shader link failed");
  }

  return prog;
}

async function switchShader(name) {
  if (name === currentShaderName) {
    console.log("[SHADER] Already active:", name);
    return;
  }

  console.log("[SHADER] Switching to:", name);

  try {
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
    uDayPhaseLoc = gl.getUniformLocation(program, "uDayPhase");

    currentShaderName = name;
  } catch (err) {
    console.error("[SHADER] Failed to switch:", err);
  }
}

// expose to console
window.switchShader = switchShader;

// =========================================================
// INIT SKY
// =========================================================
async function initSky() {
  gl = canvas.getContext("webgl", { antialias: true });
  if (!gl) {
    console.error("[WEBGL] Failed to initialize WebGL");
    return;
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  window.addEventListener("resize", resize);
  resize();

  const start = performance.now();

  function frame() {
    if (!program) {
      requestAnimationFrame(frame);
      return;
    }

    const t = (performance.now() - start) / 1000;

    gl.uniform1f(uTimeLoc, t);
    gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
    gl.uniform1f(uWeatherLoc, currentWeatherAmount);
    gl.uniform1f(uDayPhaseLoc, currentDayPhase);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(frame);
  }

  frame();
}

// =========================================================
// LOCATION HANDLING
// =========================================================
async function setLocationFromCoords(label, lat, lon, timezoneOverride) {
  console.log("[LOC] Setting location:", label, lat, lon);

  lastLocation = { label, lat, lon, timezone: timezoneOverride || "UTC" };

  const data = await fetchWeather(lat, lon);
  if (!data) {
    console.error("[LOC] Weather fetch failed for:", label);
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

  conditionEl.textContent = WEATHER_TEXT[current.weathercode] || "Unknown";

  humidityEl.textContent =
    hourly.relative_humidity_2m?.length
      ? `${Math.round(hourly.relative_humidity_2m[0])}%`
      : "--%";

  windEl.textContent =
    typeof current.windspeed === "number"
      ? `${Math.round(current.windspeed)} ${units.windSymbol}`
      : `-- ${units.windSymbol}`;

  feelsEl.textContent =
    hourly.apparent_temperature?.length
      ? `${Math.round(hourly.apparent_temperature[0])}${units.tempSymbol}`
      : `--${units.tempSymbol}`;

  buildHourly(hourly, timezone);
  buildDaily(daily);
  setRadar(lat, lon);

  // CLOUD AMOUNT → shader
  currentWeatherAmount =
    hourly.cloudcover?.length ? Math.min(1, hourly.cloudcover[0] / 100) : 0.0;

  // DAY PHASE → shader
  try {
    if (current.time && daily.sunrise?.length && daily.sunset?.length) {
      const now = new Date(current.time).getTime();
      const sunrise = new Date(daily.sunrise[0]).getTime();
      const sunset = new Date(daily.sunset[0]).getTime();

      if (now <= sunrise) {
        const span = 6 * 60 * 60 * 1000;
        currentDayPhase = 0.25 * Math.max(0, Math.min(1, 1 - (sunrise - now) / span));
      } else if (now >= sunset) {
        const span = 6 * 60 * 60 * 1000;
        currentDayPhase = 0.75 + 0.25 * Math.max(0, Math.min(1, (now - sunset) / span));
      } else {
        currentDayPhase = 0.25 + 0.5 * ((now - sunrise) / (sunset - sunrise));
      }
    } else {
      currentDayPhase = 0.5;
    }
  } catch (err) {
    console.warn("[DAYPHASE] Failed:", err);
    currentDayPhase = 0.5;
  }

  // Switch to active shader
  await switchShader(currentShaderName || "sky_weather");

  // Save recent search
  saveRecentSearch(label);

  // Update favorites UI
  renderFavorites(label);
}

// =========================================================
// CITY NAME → COORDS
// =========================================================
async function setLocationByName(name) {
  console.log("[LOC] Searching for:", name);

  // FIX: Strip state/country
  const clean = name.split(",")[0].trim();

  const geo = await geocodeCity(clean);
  if (!geo.results?.length) {
    console.warn("[LOC] No results for:", name, "(cleaned:", clean, ")");
    return;
  }

  // Prefer US results
  let r = geo.results.find(x => x.country === "United States") || geo.results[0];

  // Prefer Florida for Miami / Palm Coast
  if (/miami|palm coast/i.test(clean)) {
    r = geo.results.find(x => x.admin1 === "Florida") || r;
  }

  const label = `${r.name}, ${r.admin1 || r.country || ""}`.trim();

  await setLocationFromCoords(label, r.latitude, r.longitude, r.timezone);
}

// =========================================================
// SHADER PICKER (OPTIONAL)
// =========================================================
function pickShaderForTimeAndWeather(current, daily) {
  try {
    if (!current?.time || !daily?.sunrise?.length || !daily?.sunset?.length)
      return "sky_weather";

    const now = new Date(current.time).getTime();
    const sunrise = new Date(daily.sunrise[0]).getTime();
    const sunset = new Date(daily.sunset[0]).getTime();

    if (now < sunrise + 45 * 60 * 1000) return "sunrise";
    if (now > sunset - 45 * 60 * 1000) return "sunset";
    if (now > sunset || now < sunrise) return "night";
    return "sky_weather";
  } catch {
    return "sky_weather";
  }
}

// =========================================================
// MAIN INIT
// =========================================================
window.addEventListener("DOMContentLoaded", async () => {
  console.log("[APP] Initializing…");

  initSearch();
  initUnitToggle();

  document.getElementById("favoriteToggle").addEventListener("click", () => {
    toggleFavorite(cityNameEl.textContent);
  });

  renderFavorites("");

  await initSky();
  await switchShader("sky_weather");

  setLocationByName("Indianapolis");
});
