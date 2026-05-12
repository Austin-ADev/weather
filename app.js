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
// Replace your existing drawHourlyChart with this version.
// It builds a dense polyline, draws markers, saves a device-pixel base snapshot (ImageBitmap + ImageData),
// and stores all data the hover handler needs on the canvas element.
async function drawHourlyChart(temps, labels, symbol, conditions) {
  const canvas = document.getElementById("hourlyChart");
  const ctx = canvas.getContext("2d");

  const hourWidth = 80;
  const totalWidth = hourWidth * temps.length;
  const cssHeight = 120;

  // devicePixelRatio handling
  const DPR = window.devicePixelRatio || 1;
  canvas.style.width = totalWidth + "px";
  canvas.style.height = cssHeight + "px";
  canvas.width = Math.round(totalWidth * DPR);
  canvas.height = Math.round(cssHeight * DPR);
  // set transform so drawing uses CSS pixels
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const w = totalWidth;
  const h = cssHeight;
  const pad = 20;

  // compute min/max
  const max = Math.max(...temps);
  const min = Math.min(...temps);

  // dense polyline: sample every CSS pixel across 0..w
  const dense = new Array(w);
  for (let x = 0; x < w; x++) {
    // map x -> fractional hour index so line reaches both box edges
    const hourIndex = x / hourWidth;
    const i = Math.floor(hourIndex);

    if (i < 0) { dense[x] = { x, y: null }; continue; }
    if (i >= temps.length - 1) {
      // clamp to last hour
      const yLast = h - pad - ((temps[temps.length - 1] - min) / (max - min)) * (h - pad * 2);
      dense[x] = { x, y: yLast };
      continue;
    }

    const t = hourIndex - i;
    const y1 = h - pad - ((temps[i] - min) / (max - min)) * (h - pad * 2);
    const y2 = h - pad - ((temps[i + 1] - min) / (max - min)) * (h - pad * 2);
    const y = y1 + (y2 - y1) * t;
    dense[x] = { x, y };
  }

  // draw polyline
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#4fd1ff";
  let started = false;
  for (let i = 0; i < dense.length; i++) {
    const p = dense[i];
    if (!p || p.y === null) { started = false; continue; }
    if (!started) { ctx.moveTo(p.x, p.y); started = true; }
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  // compute hour-center points for markers (centers at i*hourWidth + hourWidth/2)
  const points = temps.map((t, i) => {
    const x = i * hourWidth + hourWidth / 2;
    const y = h - pad - ((t - min) / (max - min)) * (h - pad * 2);
    return { x, y, temp: t, index: i };
  });

  // draw and save markers with generous hit areas
  const markers = [];
  const hiIndex = temps.indexOf(max);
  const hiColor = "#bd1818";
  ctx.fillStyle = hiColor;
  ctx.beginPath();
  ctx.arc(points[hiIndex].x, points[hiIndex].y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(`High: ${Math.round(max)}${symbol}`, points[hiIndex].x + 8, points[hiIndex].y - 8);
  markers.push({
    type: "high",
    x: points[hiIndex].x,
    y: points[hiIndex].y,
    color: hiColor,
    temp: max,
    index: hiIndex,
    hitRadius: 20,
    hitBox: { w: 40, h: 40 }
  });

  const loIndex = temps.indexOf(min);
  const loColor = "#183eb9fa";
  ctx.fillStyle = loColor;
  ctx.beginPath();
  ctx.arc(points[loIndex].x, points[loIndex].y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(`Low: ${Math.round(min)}${symbol}`, points[loIndex].x + 8, points[loIndex].y + 14);
  markers.push({
    type: "low",
    x: points[loIndex].x,
    y: points[loIndex].y,
    color: loColor,
    temp: min,
    index: loIndex,
    hitRadius: 20,
    hitBox: { w: 40, h: 40 }
  });

  // cache base image (ImageData) and create ImageBitmap snapshot for robust restore
  try {
    canvas._baseImage = ctx.getImageData(0, 0, Math.round(w * DPR), Math.round(h * DPR));
  } catch (e) {
    // ignore if readback fails
    canvas._baseImage = null;
  }

  // create ImageBitmap snapshot asynchronously and store it
  try {
    // createImageBitmap accepts the canvas and captures device pixels
    const bitmap = await createImageBitmap(canvas);
    canvas._baseBitmap = bitmap;
  } catch (e) {
    canvas._baseBitmap = null;
  }

  // store data for hover handler
  canvas._densePoints = dense;
  canvas._markers = markers;
  canvas._hourWidth = hourWidth;
  canvas._DPR = DPR;
}

// Call once after drawHourlyChart to create a fast snapshot.
// Then both hover and drag functions below will use restoreBaseUsingBitmap().
async function createBaseBitmapSnapshot() {
  const canvas = document.getElementById("hourlyChart");
  if (!canvas) return;
  try {
    canvas._baseBitmap = await createImageBitmap(canvas);
    console.log("hourlyChart baseBitmap ready");
  } catch (e) {
    console.warn("createImageBitmap failed", e);
    canvas._baseBitmap = null;
  }
}

function restoreBaseUsingBitmap() {
  const canvas = document.getElementById("hourlyChart");
  if (!canvas) return false;
  const ctx = canvas.getContext("2d");
  if (canvas._baseBitmap) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(canvas._baseBitmap, 0, 0, canvas.width, canvas.height);
    const DPR = canvas._DPR || window.devicePixelRatio || 1;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.restore();
    return true;
  }
  if (canvas._baseImage) {
    try { ctx.putImageData(canvas._baseImage, 0, 0); return true; }
    catch (e) { /* fallback failed */ }
  }
  return false;
}


// HOVER SYSTEM (with hover dot)
// Replace your existing setupHourlyHover with this version.
// It attaches pointer handlers to the canvas, supports mouse hover and pointer drag (touch/pen),
// uses ImageBitmap-based restore (if available), eases auto-scroll slowly, and highlights markers with colored tooltips.
// Mouse-only hover: shows tooltip and dot on mousemove, gentle auto-scroll.
// Requires drawHourlyChart(...) to have run and set canvas._densePoints, _markers, _hourWidth, _DPR.
function setupHourlyHover(temps, labels, conditions, symbol) {
  const scroll = document.getElementById("hourlyScroll");
  const tooltip = document.getElementById("hourlyTooltip");
  const canvas = document.getElementById("hourlyChart");
  if (!canvas || !scroll || !tooltip) return;
  const ctx = canvas.getContext("2d");

  if (!canvas._densePoints) drawHourlyChart(temps, labels, symbol, conditions);
  const dense = canvas._densePoints || [];
  const markers = canvas._markers || [];
  const hourWidth = canvas._hourWidth || 80;

  // small easing scroll helper
  let scrollTarget = null, scrolling = false;
  function easeScrollTo(target) {
    scrollTarget = Math.max(0, Math.min(canvas.width - scroll.clientWidth, target));
    if (scrolling) return;
    scrolling = true;
    (function step() {
      if (scrollTarget === null) { scrolling = false; return; }
      const cur = scroll.scrollLeft;
      const d = scrollTarget - cur;
      const f = 0.12;
      if (Math.abs(d) < 0.5) { scroll.scrollLeft = scrollTarget; scrollTarget = null; scrolling = false; return; }
      scroll.scrollLeft = cur + d * f;
      requestAnimationFrame(step);
    })();
  }

  function contrastColor(hex) {
    if (!hex) return "#fff";
    if (hex[0] === "#") hex = hex.slice(1);
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    const r = parseInt(hex.substr(0,2),16), g = parseInt(hex.substr(2,2),16), b = parseInt(hex.substr(4,2),16);
    return (0.2126*r + 0.7152*g + 0.0722*b) > 150 ? "#000" : "#fff";
  }

  function drawDotAndTooltipAtPoint(p, allowAutoScroll = true) {
    if (!p) return;
    const visibleX = p.x - scroll.scrollLeft;
    const margin = 60;
    const vw = scroll.clientWidth;
    if (allowAutoScroll) {
      if (visibleX < margin) easeScrollTo(Math.max(0, p.x - margin));
      else if (visibleX > vw - margin) easeScrollTo(Math.min(canvas.width - vw, p.x - (vw - margin)));
    }

    const hourIndex = Math.max(0, Math.min(temps.length - 1, Math.floor(p.x / hourWidth + 0.5)));
    tooltip.innerHTML = `<strong>${labels[hourIndex]}</strong><br>${Math.round(temps[hourIndex])}${symbol}<br>${conditions[hourIndex]}`;
    tooltip.style.left = (p.x - scroll.scrollLeft) + "px";
    tooltip.style.top = (p.y - 20) + "px";
    tooltip.style.opacity = 1;

    restoreBaseUsingBitmap();
    const DPR = canvas._DPR || window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.stroke();
    ctx.restore();
  }

  // mousemove handler (canvas-local Y)
  function onMouseMove(ev) {
    const rect = canvas.getBoundingClientRect();
    const xInCanvas = ev.clientX - rect.left;
    const worldX = scroll.scrollLeft + xInCanvas;
    const canvasY = ev.clientY - rect.top;

    // marker priority
    for (const m of markers) {
      const dx = Math.abs(worldX - m.x);
      const dy = Math.abs(canvasY - m.y);
      const radial = Math.hypot(dx, dy) <= (m.hitRadius || 0);
      const hw = (m.hitBox && m.hitBox.w) ? m.hitBox.w/2 : 0;
      const hh = (m.hitBox && m.hitBox.h) ? m.hitBox.h/2 : 0;
      const rectHit = dx <= hw && dy <= hh;
      if (radial || rectHit) {
        const visibleX2 = m.x - scroll.scrollLeft;
        const bg = m.color || "#000";
        const fg = contrastColor(bg);
        tooltip.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${bg};margin-right:8px;vertical-align:middle"></span>
          <strong style="color:${fg}">${m.type.toUpperCase()}</strong><div style="color:${fg};margin-top:6px">${Math.round(m.temp)}${symbol}</div>`;
        tooltip.style.left = visibleX2 + "px";
        tooltip.style.top = (m.y - 20) + "px";
        tooltip.style.background = bg;
        tooltip.style.color = fg;
        tooltip.style.padding = "8px 10px";
        tooltip.style.borderRadius = "6px";
        tooltip.style.boxShadow = "0 6px 18px rgba(0,0,0,0.18)";
        tooltip.style.opacity = 1;

        restoreBaseUsingBitmap();
        const DPR = canvas._DPR || window.devicePixelRatio || 1;
        ctx.save();
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }
    }

    // line fallback
    const idx = Math.round(worldX);
    const p = dense[idx];
    if (!p || p.y === null) { tooltip.style.opacity = 0; restoreBaseUsingBitmap(); return; }
    const visibleThreshold = 40;
    if (Math.abs(canvasY - p.y) > visibleThreshold) { tooltip.style.opacity = 0; restoreBaseUsingBitmap(); return; }
    drawDotAndTooltipAtPoint(p, true);
  }

  function onMouseLeave() {
    tooltip.style.opacity = 0;
    restoreBaseUsingBitmap();
  }

  // attach handlers (remove previous if present)
  if (canvas._mouseHandlers) {
    canvas.removeEventListener("mousemove", canvas._mouseHandlers.move);
    canvas.removeEventListener("mouseleave", canvas._mouseHandlers.leave);
  }
  canvas._mouseHandlers = { move: onMouseMove, leave: onMouseLeave };
  canvas.addEventListener("mousemove", onMouseMove, { passive: true });
  canvas.addEventListener("mouseleave", onMouseLeave, { passive: true });
}

// Touch/pen drag handler: requires deliberate press near line/marker to start dragging.
// Uses pointer events but ignores mouse pointerType for drag (mouse hover handled by setupHourlyHover).
function setupHourlyDrag(temps, labels, conditions, symbol) {
  const scroll = document.getElementById("hourlyScroll");
  const tooltip = document.getElementById("hourlyTooltip");
  const canvas = document.getElementById("hourlyChart");
  if (!canvas || !scroll || !tooltip) return;
  const ctx = canvas.getContext("2d");

  if (!canvas._densePoints) drawHourlyChart(temps, labels, symbol, conditions);
  const dense = canvas._densePoints || [];
  const markers = canvas._markers || [];
  const hourWidth = canvas._hourWidth || 80;

  // easing scroll (shared)
  let scrollTarget = null, scrolling = false;
  function easeScrollTo(target) {
    scrollTarget = Math.max(0, Math.min(canvas.width - scroll.clientWidth, target));
    if (scrolling) return;
    scrolling = true;
    (function step() {
      if (scrollTarget === null) { scrolling = false; return; }
      const cur = scroll.scrollLeft;
      const d = scrollTarget - cur;
      const f = 0.12;
      if (Math.abs(d) < 0.5) { scroll.scrollLeft = scrollTarget; scrollTarget = null; scrolling = false; return; }
      scroll.scrollLeft = cur + d * f;
      requestAnimationFrame(step);
    })();
  }

  function pointInMarker(worldX, mouseY, marker) {
    const dx = Math.abs(worldX - marker.x);
    const dy = Math.abs(mouseY - marker.y);
    if (Math.hypot(dx, dy) <= (marker.hitRadius || 0)) return true;
    const hw = (marker.hitBox && marker.hitBox.w) ? marker.hitBox.w/2 : 0;
    const hh = (marker.hitBox && marker.hitBox.h) ? marker.hitBox.h/2 : 0;
    return dx <= hw && dy <= hh;
  }

  let dragging = false;
  let activePointerId = null;

  function handleDrag(worldX, canvasY) {
    // marker priority
    for (const m of markers) {
      if (pointInMarker(worldX, canvasY, m)) {
        const visibleX = m.x - scroll.scrollLeft;
        const margin = 60;
        const vw = scroll.clientWidth;
        if (visibleX < margin) easeScrollTo(Math.max(0, m.x - margin));
        else if (visibleX > vw - margin) easeScrollTo(Math.min(canvas.width - vw, m.x - (vw - margin)));

        const visibleX2 = m.x - scroll.scrollLeft;
        const bg = m.color || "#000";
        const fg = (function(hex){ if(!hex) return "#fff"; if(hex[0]==="#") hex=hex.slice(1); if(hex.length===3) hex=hex.split("").map(c=>c+c).join(""); const r=parseInt(hex.substr(0,2),16),g=parseInt(hex.substr(2,2),16),b=parseInt(hex.substr(4,2),16); return (0.2126*r+0.7152*g+0.0722*b)>150?"#000":"#fff"; })(bg);
        tooltip.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${bg};margin-right:8px;vertical-align:middle"></span>
          <strong style="vertical-align:middle;color:${fg}">${m.type.toUpperCase()}</strong><div style="color:${fg};margin-top:6px">${Math.round(m.temp)}${symbol}</div>`;
        tooltip.style.left = visibleX2 + "px";
        tooltip.style.top = (m.y - 20) + "px";
        tooltip.style.background = bg;
        tooltip.style.color = fg;
        tooltip.style.padding = "8px 10px";
        tooltip.style.borderRadius = "6px";
        tooltip.style.boxShadow = "0 6px 18px rgba(0,0,0,0.18)";
        tooltip.style.opacity = 1;

        restoreBaseUsingBitmap();
        const DPR = canvas._DPR || window.devicePixelRatio || 1;
        ctx.save();
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }
    }

    // line fallback
    const idx = Math.round(worldX);
    const p = dense[idx];
    if (!p || p.y === null) { tooltip.style.opacity = 0; restoreBaseUsingBitmap(); return; }
    const visibleThreshold = 40;
    if (Math.abs(canvasY - p.y) > visibleThreshold) { tooltip.style.opacity = 0; restoreBaseUsingBitmap(); return; }

    const visibleX = p.x - scroll.scrollLeft;
    const margin = 60;
    const vw = scroll.clientWidth;
    if (visibleX < margin) easeScrollTo(Math.max(0, p.x - margin));
    else if (visibleX > vw - margin) easeScrollTo(Math.min(canvas.width - vw, p.x - (vw - margin)));

    const visibleX2 = p.x - scroll.scrollLeft;
    const hourIndex = Math.max(0, Math.min(temps.length - 1, Math.floor(p.x / hourWidth + 0.5)));
    tooltip.innerHTML = `<strong>${labels[hourIndex]}</strong><br>${Math.round(temps[hourIndex])}${symbol}<br>${conditions[hourIndex]}`;
    tooltip.style.left = visibleX2 + "px";
    tooltip.style.top = (p.y - 20) + "px";
    tooltip.style.opacity = 1;
    tooltip.style.background = "";
    tooltip.style.color = "";
    tooltip.style.padding = "";
    tooltip.style.boxShadow = "";

    restoreBaseUsingBitmap();
    const DPR = canvas._DPR || window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.stroke();
    ctx.restore();
  }

  function onPointerDown(ev) {
    if (ev.pointerType === "mouse") return; // mouse drag handled by hover function
    const rect = canvas.getBoundingClientRect();
    const xInCanvas = ev.clientX - rect.left;
    const worldX = scroll.scrollLeft + xInCanvas;
    const canvasY = ev.clientY - rect.top;

    // start drag only if near line/marker
    // test markers and line without auto-scroll to decide
    let hit = false;
    for (const m of markers) {
      if (pointInMarker(worldX, canvasY, m)) { hit = true; break; }
    }
    if (!hit) {
      const idx = Math.round(worldX);
      const p = dense[idx];
      if (p && p.y !== null && Math.abs(canvasY - p.y) <= 40) hit = true;
    }

    if (hit) {
      dragging = true;
      activePointerId = ev.pointerId;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault();
      handleDrag(worldX, canvasY);
    }
  }

  function onPointerMove(ev) {
    if (!dragging || ev.pointerId !== activePointerId) return;
    const rect = canvas.getBoundingClientRect();
    const xInCanvas = ev.clientX - rect.left;
    const worldX = scroll.scrollLeft + xInCanvas;
    const canvasY = ev.clientY - rect.top;
    ev.preventDefault();
    handleDrag(worldX, canvasY);
  }

  function onPointerUp(ev) {
    if (dragging && ev.pointerId === activePointerId) {
      dragging = false;
      activePointerId = null;
      try { canvas.releasePointerCapture && canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
      tooltip.style.opacity = 0;
      restoreBaseUsingBitmap();
    }
  }

  // attach handlers (avoid duplicates)
  if (canvas._dragHandlers) {
    canvas.removeEventListener("pointerdown", canvas._dragHandlers.down);
    window.removeEventListener("pointermove", canvas._dragHandlers.move);
    window.removeEventListener("pointerup", canvas._dragHandlers.up);
    window.removeEventListener("pointercancel", canvas._dragHandlers.up);
  }
  canvas._dragHandlers = { down: onPointerDown, move: onPointerMove, up: onPointerUp };
  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerUp, { passive: true });
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
