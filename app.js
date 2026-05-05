// app.js
import { Sky } from "./sky/sky.js";
import { WeatherEngine } from "./sky/weatherEngine.js";

// ---------- Debug logger ----------
const log = {
  app: (...msg) => console.log("%c[APP]", "color:#4af", ...msg),
  sky: (...msg) => console.log("%c[SKY]", "color:#6f6", ...msg),
  weather: (...msg) => console.log("%c[WEATHER]", "color:#ff6", ...msg),
  fetch: (...msg) => console.log("%c[FETCH]", "color:#f66", ...msg),
  search: (...msg) => console.log("%c[SEARCH]", "color:#9cf", ...msg),
  radar: (...msg) => console.log("%c[RADAR]", "color:#fc9", ...msg),
  fade: (...msg) => console.log("%c[FADE]", "color:#ccc", ...msg)
};

// ---------- DOM refs ----------
const skyCanvas = document.getElementById("sky");

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

// ---------- WebGL + GPU tier detection ----------
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

function detectTier() {
  const testCanvas = document.createElement("canvas");
  const testGl = testCanvas.getContext("webgl");
  if (!testGl) {
    log.app("No WebGL context for GPU detection, defaulting to LOW tier.");
    return "low";
  }

  const ext = testGl.getExtension("WEBGL_debug_renderer_info");
  let renderer = "unknown";
  if (ext) {
    renderer = testGl
      .getParameter(ext.UNMASKED_RENDERER_WEBGL)
      .toLowerCase();
  }

  log.app("GPU renderer:", renderer);

  const dedicatedKeywords = [
    "nvidia", "geforce", "rtx", "gtx",
    "radeon", "rx", "arc", "quadro",
    "m1 pro", "m1 max", "m2 pro", "m2 max"
  ];

  const isDedicated = dedicatedKeywords.some(k => renderer.includes(k));
  const tier = isDedicated ? "high" : "low";

  log.app("Selected tier:", tier, "(dedicated:", isDedicated, ")");
  return tier;
}

const gpuTier = detectTier(); // "high" (realistic) or "low" (stylized)

// ---------- Fade helpers (only sky) ----------
function fadeOutSky() {
  log.fade("Fading OUT sky…");
  skyCanvas.classList.add("fade-out");
}

function fadeInSky() {
  log.fade("Fading IN sky…");
  skyCanvas.classList.remove("fade-out");
}

// ---------- Radar ----------
function setRadar(lat, lon) {
  const url = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&zoom=5&level=surface&overlay=radar`;
  radarFrame.src = url;
  log.radar("Radar updated:", url);
}

// ---------- Time + moon ----------
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

function getLocalHour(dateStr, timezone) {
  try {
    const d = new Date(dateStr);
    const hourStr = d.toLocaleString("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: timezone
    });
    return parseInt(hourStr, 10);
  } catch {
    return 12;
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

// ---------- Weather → shader mapping ----------
function mapWeatherType(code, isNight) {
  // Open-Meteo codes → our shader keys
  if (isNight) {
    if ([95, 96, 99].includes(code)) return "nightStorm";
    if ([2, 3].includes(code)) return "nightCloudy";
    return "night";
  }

  if (code === 0) return "sunny";
  if (code === 1) return "mostlyClear";
  if (code === 2) return "partlyCloudy";
  if (code === 3) return "cloudy";

  if ([45, 48].includes(code)) return "fog";

  if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";

  if ([61, 63, 66].includes(code)) return "rain";
  if ([65, 67].includes(code)) return "heavyRain";

  if ([80, 81, 82].includes(code)) return "showers";

  if ([71, 73, 77].includes(code)) return "snow";
  if ([75].includes(code)) return "heavySnow";

  if ([85, 86].includes(code)) return "snowShowers";

  if ([95, 96, 99].includes(code)) return "storm";

  return isNight ? "night" : "cloudy";
}

// ---------- Forecast builders ----------
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

// ---------- API ----------
async function fetchWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
    `&hourly=temperature_2m,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,moon_phase` +
    `&timezone=auto`;

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

// ---------- Search UI ----------
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

// ---------- Location + weather application ----------
async function setLocationFromCoords(label, lat, lon, timezoneOverride) {
  log.app("Setting location:", label, lat, lon);

  fadeOutSky();

  setTimeout(async () => {
    try {
      const data = await fetchWeather(lat, lon);
      const current = data.current;
      const daily = data.daily;
      const hourly = data.hourly;
      const timezone = data.timezone || timezoneOverride || "UTC";

      const code = current.weather_code;
      const hour = getLocalHour(current.time, timezone);
      const isNight = hour < 6 || hour >= 20;
      const weatherType = mapWeatherType(code, isNight);

      log.weather("Weather code:", code, "→ type:", weatherType, "night:", isNight);

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

      // Tell Sky to switch to the correct weather shader for this GPU tier
      log.sky("Switching shader to:", weatherType, "tier:", gpuTier);
      await Sky.setWeatherShader(weatherType, gpuTier);

    } catch (e) {
      log.app("ERROR setting location:", e);
    } finally {
      fadeInSky();
    }
  }, 250);
}

// ---------- Hourly toggle ----------
function initHourlyToggle() {
  if (!hourlyToggle || !forecastEl) return;

  hourlyToggle.addEventListener("click", () => {
    const isOpen = forecastEl.classList.toggle("open");
    hourlyToggle.classList.toggle("open", isOpen);
    log.app("Toggled hourly forecast:", isOpen);
  });
}

// ---------- Geolocation ----------
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

// ---------- MAIN ----------
(async () => {
  log.app("Initializing Sky with tier:", gpuTier);
  await Sky.init(gl, gpuTier); // Sky will use tier to pick high/low shaders

  initSearch();
  initHourlyToggle();
  initDetectLocation();

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
    requestAnimationFrame(frame);
  }

  frame();
})();
