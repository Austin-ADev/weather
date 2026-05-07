// app.js
import { Sky } from "./sky/sky.js";
import { WeatherEngine } from "./sky/weatherEngine.js";

/* -------------------------------------------------------
   LOGGING (Hybrid: clean but informative)
------------------------------------------------------- */
const log = {
  app: (...msg) => console.log("%c[APP]", "color:#4af", ...msg),
  fetch: (...msg) => console.log("%c[FETCH]", "color:#f66", ...msg),
  search: (...msg) => console.log("%c[SEARCH]", "color:#9cf", ...msg),
  sky: (...msg) => console.log("%c[SKY]", "color:#6f6", ...msg),
  radar: (...msg) => console.log("%c[RADAR]", "color:#fc9", ...msg)
};

let firstLoad = true;

/* -------------------------------------------------------
   UNIT SYSTEM (US ↔ Metric)
------------------------------------------------------- */
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

/* -------------------------------------------------------
   DOM ELEMENTS
------------------------------------------------------- */
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
const unitToggleBtn = document.getElementById("unitToggle");

/* -------------------------------------------------------
   WEBGL INIT
------------------------------------------------------- */
log.app("Initializing WebGL…");
const gl = skyCanvas.getContext("webgl", { antialias: true });

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = skyCanvas.getBoundingClientRect();
  skyCanvas.width = rect.width * dpr;
  skyCanvas.height = rect.height * dpr;
  gl.viewport(0, 0, skyCanvas.width, skyCanvas.height);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/* -------------------------------------------------------
   GPU TIER DETECTION
------------------------------------------------------- */
function detectTier() {
  const testCanvas = document.createElement("canvas");
  const testGl = testCanvas.getContext("webgl");
  if (!testGl) return "low";

  const ext = testGl.getExtension("WEBGL_debug_renderer_info");
  let renderer = ext
    ? testGl.getParameter(ext.UNMASKED_RENDERER_WEBGL).toLowerCase()
    : "unknown";

  const dedicated = [
    "nvidia", "geforce", "rtx", "gtx",
    "radeon", "rx", "arc", "quadro",
    "m1 pro", "m1 max", "m2 pro", "m2 max"
  ];

  return dedicated.some(k => renderer.includes(k)) ? "high" : "low";
}

const gpuTier = detectTier();
log.app("GPU Tier:", gpuTier);

/* -------------------------------------------------------
   FADE HELPERS
------------------------------------------------------- */
function fadeOutSky() {
  skyCanvas.classList.add("fade-out");
}
function fadeInSky() {
  skyCanvas.classList.remove("fade-out");
}

/* -------------------------------------------------------
   RADAR
------------------------------------------------------- */
function setRadar(lat, lon) {
  log.radar("Updating radar:", { lat, lon });
  radarFrame.src =
    `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&zoom=5&overlay=radar`;
}

/* -------------------------------------------------------
   TIME HELPERS
------------------------------------------------------- */
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
    return parseInt(
      d.toLocaleString("en-US", {
        hour: "2-digit",
        hour12: false,
        timeZone: timezone
      }),
      10
    );
  } catch {
    return 12;
  }
}

/* -------------------------------------------------------
   MOON PHASE LABEL
------------------------------------------------------- */
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

/* -------------------------------------------------------
   WEATHER → SHADER MAPPING
------------------------------------------------------- */
function mapWeatherType(code, isNight) {
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

/* -------------------------------------------------------
   FORECAST BUILDERS
------------------------------------------------------- */
function buildHourly(hourly, timezone) {
  forecastEl.innerHTML = "";
  const units = getUnitParams();

  for (let i = 0; i < 24; i++) {
    const row = document.createElement("div");
    row.className = "forecast-hour";

    row.innerHTML = `
      <div>${formatTime(hourly.time[i], timezone)}</div>
      <div>${Math.round(hourly.temperature_2m[i])}${units.tempSymbol}</div>
      <div>${WeatherEngine.describe(hourly.weather_code[i])}</div>
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
      <div>${WeatherEngine.describe(daily.weather_code[i])}</div>
    `;

    dailyForecastEl.appendChild(row);
  }
}

/* -------------------------------------------------------
   API: WEATHER
------------------------------------------------------- */
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

  log.fetch("Fetching weather:", url);

  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather fetch failed");

  return res.json();
}

/* -------------------------------------------------------
   API: GEOCODING
------------------------------------------------------- */
async function geocodeCity(name) {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      name
    )}&count=5&language=en&format=json`;

  log.search("Geocoding:", url);

  const res = await fetch(url);
  if (!res.ok) throw new Error("Geocode failed");

  return res.json();
}

/* -------------------------------------------------------
   SEARCH UI
------------------------------------------------------- */
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

async function setLocationByName(name) {
  const geo = await geocodeCity(name);
  if (!geo.results?.length) return;

  const r = geo.results[0];
  const label = `${r.name}, ${r.admin1 || r.country || ""}`.trim();

  setLocationFromCoords(label, r.latitude, r.longitude, r.timezone);
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

/* -------------------------------------------------------
   APPLY WEATHER TO UI
------------------------------------------------------- */
async function setLocationFromCoords(label, lat, lon, timezoneOverride) {

  if (!firstLoad) fadeOutSky();
  firstLoad = false;

  setTimeout(async () => {
    try {
      const data = await fetchWeather(lat, lon);

      const current = data.current_weather;
      const daily = data.daily;
      const hourly = data.hourly;
      const timezone = data.timezone || timezoneOverride || "UTC";

      const units = getUnitParams();

      const code = current.weathercode;
      const hour = getLocalHour(current.time, timezone);
      const isNight = hour < 6 || hour >= 20;
      const weatherType = mapWeatherType(code, isNight);

      WeatherEngine.setFromAPI(label, code);

      cityNameEl.textContent = label;
      localtimeEl.textContent = formatTime(current.time, timezone);
      tempEl.textContent = `${Math.round(current.temperature)}${units.tempSymbol}`;
      conditionEl.textContent = WeatherEngine.describe(code);

      humidityEl.textContent = `${Math.round(hourly.relative_humidity_2m[0])}%`;
      windEl.textContent = `${Math.round(current.windspeed)} ${units.windSymbol}`;
      feelsEl.textContent = `${Math.round(hourly.apparent_temperature[0])}${units.tempSymbol}`;

      moonLabelEl.textContent = moonPhaseLabel(daily.moon_phase[0]);

      buildHourly(hourly, timezone);
      buildDaily(daily);
      setRadar(lat, lon);

      await Sky.setWeatherShader(weatherType, gpuTier);
    } catch (e) {
      log.app("Weather error:", e);
    } finally {
      fadeInSky();
    }
  }, 250);
}

/* -------------------------------------------------------
   UNIT TOGGLE
------------------------------------------------------- */
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

/* -------------------------------------------------------
   HOURLY TOGGLE
------------------------------------------------------- */
function initHourlyToggle() {
  hourlyToggle.addEventListener("click", () => {
    forecastEl.classList.toggle("open");
    hourlyToggle.classList.toggle("open");
  });
}

/* -------------------------------------------------------
   GEOLOCATION
------------------------------------------------------- */
function initDetectLocation() {
  detectLocationBtn.addEventListener("click", () => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setLocationFromCoords("My Location", latitude, longitude);
      },
      err => log.app("Geolocation error:", err)
    );
  });
}

/* -------------------------------------------------------
   MAIN
------------------------------------------------------- */
(async () => {
  log.sky("Sky.init() starting");
  await Sky.init(gl, gpuTier);
  log.sky("Sky.init() complete");

  initSearch();
  initHourlyToggle();
  initDetectLocation();
  initUnitToggle();

  log.app("Initial location: Indianapolis");
  setLocationByName("Indianapolis");

  function frame() {
    Sky.update();
    requestAnimationFrame(frame);
  }
  frame();
})();
