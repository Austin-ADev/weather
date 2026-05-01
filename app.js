// app.js
import { Sky } from "./sky/sky.js";
import { WeatherEngine } from "./sky/weatherEngine.js";

// Debug helper
const log = {
  app: (...msg) => console.log("%c[APP]", "color:#4af", ...msg),
  sky: (...msg) => console.log("%c[SKY]", "color:#6f6", ...msg),
  weather: (...msg) => console.log("%c[WEATHER]", "color:#ff6", ...msg),
  fetch: (...msg) => console.log("%c[FETCH]", "color:#f66", ...msg),
  search: (...msg) => console.log("%c[SEARCH]", "color:#9cf", ...msg),
  radar: (...msg) => console.log("%c[RADAR]", "color:#fc9", ...msg),
  fade: (...msg) => console.log("%c[FADE]", "color:#ccc", ...msg)
};

// DOM references
const skyCanvas = document.getElementById("sky");
const weatherContent = document.getElementById("weatherContent");

const cityNameEl = document.getElementById("cityName");
const localtimeEl = document.getElementById("localtime");
const moonLabelEl = document.getElementById("moonLabel");
const tempEl = document.getElementById("temp");
const conditionEl = document.getElementById("condition");
const humidityEl = document.getElementById("humidity");
const windEl = document.getElementById("wind");
const feelsEl = document.getElementById("feels");

const forecastEl = document.getElementById("forecast");
const dailyForecastEl = document.getElementById("dailyForecast");
const radarFrame = document.getElementById("radarFrame");

const hourlyToggle = document.getElementById("hourlyToggle");
const searchInput = document.getElementById("citySearch");
const searchResults = document.getElementById("searchResults");
const detectLocationBtn = document.getElementById("detectLocation");

// WebGL
log.app("Initializing WebGL…");
const gl = skyCanvas.getContext("webgl", { antialias: true });

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = skyCanvas.getBoundingClientRect();
  skyCanvas.width = rect.width * dpr;
  skyCanvas.height = rect.height * dpr;
  gl.viewport(0, 0, skyCanvas.width, skyCanvas.height);

  log.sky("Canvas resized:", {
    cssWidth: rect.width,
    cssHeight: rect.height,
    pixelWidth: skyCanvas.width,
    pixelHeight: skyCanvas.height,
    dpr
  });
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Shader tiers
const shaderSets = [
  { tier: 1, vert: "shaders/vert.glsl", frag: "shaders/perf.frag" },
  { tier: 2, vert: "shaders/vert.glsl", frag: "shaders/high.frag" },
  { tier: 3, vert: "shaders/vert.glsl", frag: "shaders/ultraB.frag" },
  { tier: 4, vert: "shaders/vert.glsl", frag: "shaders/ultraC.frag" }
];

log.sky("Shader sets:", shaderSets);

// Fade helpers
function fadeOutWeather() {
  log.fade("Fading OUT weather + sky…");
  weatherContent.classList.add("fade-out");
  skyCanvas.classList.add("fade-out");
}

function fadeInWeather() {
  log.fade("Fading IN weather + sky…");
  weatherContent.classList.remove("fade-out");
  skyCanvas.classList.remove("fade-out");
}

// Radar
function setRadar(lat, lon) {
  const url = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&zoom=5&level=surface&overlay=radar`;
  radarFrame.src = url;
  log.radar("Radar updated:", url);
}

// Time formatting
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

// Moon phase
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

// Build hourly forecast
function buildHourly(hourly, timezone) {
  log.weather("Building hourly forecast…");
  forecastEl.innerHTML = "";
  const hours = hourly.time.slice(0, 24);

  for (let i = 0; i < hours.length; i++) {
    const row = document.createElement("div");
    row.className = "forecast-hour";

    const t = formatTime(hours[i], timezone);
    const temp = Math.round(hourly.temperature_2m[i]);
    const code = hourly.weather_code[i];
    const desc = WeatherEngine.describe(code);

    row.innerHTML = `
      <div>${t}</div>
      <div>${temp}°F</div>
      <div>${desc}</div>
    `;
    forecastEl.appendChild(row);
  }
}

// Build daily forecast
function buildDaily(daily) {
  log.weather("Building daily forecast…");
  dailyForecastEl.innerHTML = "";
  const days = daily.time;

  for (let i = 0; i < days.length; i++) {
    const row = document.createElement("div");
    row.className = "daily-row";

    const d = new Date(days[i]).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric"
    });

    const tMin = Math.round(daily.temperature_2m_min[i]);
    const tMax = Math.round(daily.temperature_2m_max[i]);
    const code = daily.weather_code[i];
    const desc = WeatherEngine.describe(code);

    row.innerHTML = `
      <div>${d}</div>
      <div>${tMax}° / ${tMin}°F</div>
      <div>${desc}</div>
    `;
    dailyForecastEl.appendChild(row);
  }
}

// API fetch
async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,moon_phase&timezone=auto`;

  log.fetch("Fetching weather:", url);

  const res = await fetch(url);
  if (!res.ok) {
    log.fetch("Weather fetch FAILED:", res.status);
    throw new Error("Weather fetch failed");
  }

  const json = await res.json();
  log.fetch("Weather fetch SUCCESS:", json);
  return json;
}

// Geocoding
async function geocodeCity(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    name
  )}&count=5&language=en&format=json`;

  log.search("Geocoding:", url);

  const res = await fetch(url);
  if (!res.ok) throw new Error("Geocode failed");

  const json = await res.json();
  log.search("Geocode results:", json);
  return json;
}

// Search results
function showSearchResults(results) {
  searchResults.innerHTML = "";
  if (!results || !results.results || results.results.length === 0) {
    searchResults.style.display = "none";
    return;
  }

  log.search("Showing search results:", results.results.length);

  results.results.forEach(r => {
    const item = document.createElement("div");
    item.className = "search-item";

    const label = `${r.name}, ${r.admin1 || r.country || ""}`.trim();
    item.textContent = label;

    item.addEventListener("click", () => {
      log.search("Selected:", label);
      searchResults.style.display = "none";
      searchInput.value = label;
      setLocationFromCoords(label, r.latitude, r.longitude, r.timezone);
    });

    searchResults.appendChild(item);
  });

  searchResults.style.display = "block";
}

// Set location from coordinates
async function setLocationFromCoords(label, lat, lon, timezoneOverride) {
  log.app("Setting location:", label, lat, lon);

  fadeOutWeather();

  setTimeout(async () => {
    try {
      const data = await fetchWeather(lat, lon);
      const current = data.current;
      const daily = data.daily;
      const hourly = data.hourly;
      const timezone = data.timezone || timezoneOverride || "UTC";

      const code = current.weather_code;
      log.weather("Applying weather code:", code, WeatherEngine.describe(code));

      WeatherEngine.setFromAPI(label, code);

      cityNameEl.textContent = label;
      localtimeEl.textContent = formatTime(current.time, timezone);
      tempEl.textContent = `${Math.round(current.temperature_2m)}°F`;
      conditionEl.textContent = WeatherEngine.describe(code);
      humidityEl.textContent = `${Math.round(current.relative_humidity_2m)}%`;
      windEl.textContent = `${Math.round(current.wind_speed_10m)} mph`;
      feelsEl.textContent = `${Math.round(current.apparent_temperature)}°F`;

      const moonPhase = daily.moon_phase[0];
      moonLabelEl.textContent = moonPhaseLabel(moonPhase);

      buildHourly(hourly, timezone);
      buildDaily(daily);
      setRadar(lat, lon);

    } catch (e) {
      log.app("ERROR setting location:", e);
    } finally {
      fadeInWeather();
    }
  }, 350);
}

// Set location by name
async function setLocationByName(name) {
  log.search("Searching for:", name);

  try {
    const geo = await geocodeCity(name);
    if (!geo.results || geo.results.length === 0) {
      log.search("No results for:", name);
      return;
    }

    const r = geo.results[0];
    const label = `${r.name}, ${r.admin1 || r.country || ""}`.trim();

    log.search("Resolved to:", label);

    await setLocationFromCoords(label, r.latitude, r.longitude, r.timezone);
  } catch (e) {
    log.search("Search error:", e);
  }
}

// Search input
function initSearch() {
  let searchTimeout = null;

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim();
    log.search("Input:", q);

    if (searchTimeout) clearTimeout(searchTimeout);

    if (!q) {
      searchResults.style.display = "none";
      return;
    }

    searchTimeout = setTimeout(async () => {
      try {
        const geo = await geocodeCity(q);
        showSearchResults(geo);
      } catch (e) {
        log.search("Error:", e);
      }
    }, 250);
  });
}

// Collapsible hourly forecast
function initHourlyToggle() {
  if (!hourlyToggle || !forecastEl) return;

  hourlyToggle.addEventListener("click", () => {
    const isOpen = forecastEl.classList.toggle("open");
    hourlyToggle.classList.toggle("open", isOpen);
    log.app("Toggled hourly forecast:", isOpen);
  });
}

// Detect location
function initDetectLocation() {
  if (!detectLocationBtn) return;

  detectLocationBtn.addEventListener("click", () => {
    log.app("Detecting location…");

    if (!navigator.geolocation) {
      log.app("Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        log.app("Location detected:", latitude, longitude);
        setLocationFromCoords("My Location", latitude, longitude);
      },
      err => {
        log.app("Geolocation error:", err);
      }
    );
  });
}

// MAIN
(async () => {
  log.app("Initializing SkyEngine…");
  await Sky.init(gl, shaderSets);

  initSearch();
  initHourlyToggle();
  initDetectLocation();

  // Default location
  log.app("Loading default location: Indianapolis");
  setLocationByName("Indianapolis");

  let frameCount = 0;
  let lastTime = performance.now();

  function frame() {
    frameCount++;

    const now = performance.now();
    if (now - lastTime >= 1000) {
      log.sky("FPS:", frameCount);
      frameCount = 0;
      lastTime = now;
    }

    Sky.update();
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(frame);
  }

  frame();
})();
