// Helpers
const $ = (sel) => document.querySelector(sel);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// DOM refs
const skyCanvas = $("#sky");
const weatherBox = $(".weather-box");
const cityNameEl = $("#cityName");
const localtimeEl = $("#localtime");
const tempEl = $("#temp");
const conditionEl = $("#condition");
const humidityEl = $("#humidity");
const windEl = $("#wind");
const feelsEl = $("#feels");
const moonLabelEl = $("#moonLabel");
const forecastEl = $("#forecast");
const dailyEl = $("#dailyForecast");
const radarFrame = $("#radarFrame");
const searchInput = $("#citySearch");
const searchResults = $("#searchResults");
const detectBtn = $("#detectLocation");
const voiceBtn = $("#voiceSearch");
const hourlyToggle = $("#hourlyToggle");

// State
let currentLocation = null;
let currentTimezone = "UTC";

// Open-Meteo endpoints
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

// Fade wrapper to avoid jump
async function withFade(fn) {
  weatherBox.classList.add("fade-out");
  skyCanvas.classList.add("fade-out");
  await delay(250);
  await fn();
  weatherBox.classList.remove("fade-out");
  skyCanvas.classList.remove("fade-out");
}

// Geocoding / search
async function searchCities(query) {
  if (!query || query.trim().length < 2) {
    searchResults.style.display = "none";
    searchResults.innerHTML = "";
    return;
  }

  const url = `${GEO_URL}?name=${encodeURIComponent(query)}&count=8&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();
  if (!data.results) {
    searchResults.style.display = "none";
    searchResults.innerHTML = "";
    return;
  }

  searchResults.innerHTML = "";
  data.results.forEach((r) => {
    const div = document.createElement("div");
    div.className = "search-item";
    const label = `${r.name}, ${r.country}${r.admin1 ? " • " + r.admin1 : ""}`;
    div.textContent = label;
    div.addEventListener("click", () => {
      searchResults.style.display = "none";
      searchInput.value = r.name;
      setLocation({
        name: r.name,
        country: r.country,
        lat: r.latitude,
        lon: r.longitude,
        timezone: r.timezone || "UTC",
      });
    });
    searchResults.appendChild(div);
  });
  searchResults.style.display = "block";
}

// Weather fetch
async function fetchWeather(lat, lon, timezone) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,moon_phase",
    current_weather: "true",
    timezone: timezone || "auto",
  });

  const res = await fetch(`${WEATHER_URL}?${params.toString()}`);
  if (!res.ok) throw new Error("Weather fetch failed");
  return res.json();
}

// Weather code → text
function weatherCodeToText(code) {
  const map = {
    0: "Clear",
    1: "Mainly Clear",
    2: "Partly Cloudy",
    3: "Cloudy",
    45: "Fog",
    48: "Depositing Rime Fog",
    51: "Light Drizzle",
    53: "Drizzle",
    55: "Heavy Drizzle",
    61: "Light Rain",
    63: "Rain",
    65: "Heavy Rain",
    71: "Light Snow",
    73: "Snow",
    75: "Heavy Snow",
    80: "Light Showers",
    81: "Showers",
    82: "Heavy Showers",
    95: "Thunderstorm",
    96: "Thunderstorm with Hail",
    99: "Severe Thunderstorm",
  };
  return map[code] || "Unknown";
}

// Moon phase label
function moonPhaseLabel(value) {
  if (value === 0 || value === 1) return "New Moon";
  if (value < 0.25) return "Waxing Crescent";
  if (value === 0.25) return "First Quarter";
  if (value < 0.5) return "Waxing Gibbous";
  if (value === 0.5) return "Full Moon";
  if (value < 0.75) return "Waning Gibbous";
  if (value === 0.75) return "Last Quarter";
  return "Waning Crescent";
}

// Radar URL (Windy embed)
function buildRadarURL(lat, lon) {
  return `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&zoom=7&level=surface&overlay=radar`;
}

// Update UI
function updateCurrent(data) {
  const cw = data.current_weather;
  const hourly = data.hourly;
  const idx = hourly.time.indexOf(cw.time);

  const temp = cw.temperature;
  const feels = idx >= 0 ? hourly.apparent_temperature[idx] : cw.temperature;
  const humidity = idx >= 0 ? hourly.relative_humidity_2m[idx] : null;

  tempEl.textContent = `${Math.round(temp)}°F`;
  conditionEl.textContent = weatherCodeToText(cw.weathercode);
  humidityEl.textContent = humidity != null ? `${humidity}%` : "--%";
  windEl.textContent = `${Math.round(cw.windspeed)} mph`;
  feelsEl.textContent = `${Math.round(feels)}°F`;

  localtimeEl.textContent = cw.time.replace("T", " ");

  const icon = document.createElement("div");
  icon.textContent = "";
  $("#currentIcon").innerHTML = "";
  $("#currentIcon").appendChild(icon);
}

function updateHourly(data) {
  const hourly = data.hourly;
  const times = hourly.time;
  const temps = hourly.temperature_2m;
  const codes = hourly.weather_code || hourly.weathercode || hourly.weather_code_2m;

  const nowIndex = times.findIndex((t) => t === data.current_weather.time);
  const start = nowIndex >= 0 ? nowIndex : 0;

  forecastEl.innerHTML = "";
  const limit = Math.min(start + 24, times.length);

  for (let i = start; i < limit; i++) {
    const row = document.createElement("div");
    row.className = "forecast-hour";

    const time = times[i].split("T")[1] || times[i];
    const temp = `${Math.round(temps[i])}°F`;
    const cond = weatherCodeToText(codes ? codes[i] : data.current_weather.weathercode);

    row.innerHTML = `
      <div>${time}</div>
      <div>${temp}</div>
      <div>${cond}</div>
    `;
    forecastEl.appendChild(row);
  }
}

function updateDaily(data) {
  const daily = data.daily;
  dailyEl.innerHTML = "";

  for (let i = 0; i < daily.time.length; i++) {
    const row = document.createElement("div");
    row.className = "daily-row";

    const date = new Date(daily.time[i]);
    const day = date.toLocaleDateString("en-US", { weekday: "short" });

    const min = Math.round(daily.temperature_2m_min[i]);
    const max = Math.round(daily.temperature_2m_max[i]);
    const cond = weatherCodeToText(daily.weather_code[i]);

    row.innerHTML = `
      <div>${day}</div>
      <div>${min}° / ${max}°</div>
      <div>${cond}</div>
    `;
    dailyEl.appendChild(row);
  }

  if (daily.moon_phase && daily.moon_phase.length) {
    moonLabelEl.textContent = moonPhaseLabel(daily.moon_phase[0]);
  }
}

function updateRadar(lat, lon) {
  radarFrame.src = buildRadarURL(lat, lon);
}

// Location handling
async function setLocation(loc) {
  currentLocation = loc;
  currentTimezone = loc.timezone || "auto";

  await withFade(async () => {
    cityNameEl.textContent = `${loc.name}, ${loc.country}`;
    const data = await fetchWeather(loc.lat, loc.lon, currentTimezone);
    updateCurrent(data);
    updateHourly(data);
    updateDaily(data);
    updateRadar(loc.lat, loc.lon);

    // Hook for your multi-tier shader engine:
    // SkyEngine.setWeather(data.current_weather, data);
  });
}

// Geolocation
function initGeolocation() {
  if (!("geolocation" in navigator)) {
    console.warn("Geolocation not supported, defaulting to Indianapolis");
    setLocation({
      name: "Indianapolis",
      country: "United States",
      lat: 39.7684,
      lon: -86.1581,
      timezone: "America/Indiana/Indianapolis",
    });
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      fetch(`${GEO_URL}?latitude=${latitude}&longitude=${longitude}&count=1&language=en&format=json`)
        .then((r) => r.json())
        .then((data) => {
          const r = data.results && data.results[0];
          setLocation({
            name: r ? r.name : "My Location",
            country: r ? r.country : "",
            lat: latitude,
            lon: longitude,
            timezone: r ? r.timezone : "auto",
          });
        })
        .catch(() => {
          setLocation({
            name: "My Location",
            country: "",
            lat: latitude,
            lon: longitude,
            timezone: "auto",
          });
        });
    },
    () => {
      console.warn("Geolocation denied, defaulting to Indianapolis");
      setLocation({
        name: "Indianapolis",
        country: "United States",
        lat: 39.7684,
        lon: -86.1581,
        timezone: "America/Indiana/Indianapolis",
      });
    }
  );
}

// Voice search
function initVoiceSearch() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("SpeechRecognition not supported");
    voiceBtn.style.display = "none";
    return;
  }

  const rec = new SpeechRecognition();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  voiceBtn.addEventListener("click", () => {
    rec.start();
  });

  rec.addEventListener("result", (e) => {
    const text = e.results[0][0].transcript;
    searchInput.value = text;
    searchCities(text);
  });
}

// Collapsible 24h
function initCollapsible() {
  hourlyToggle.addEventListener("click", () => {
    hourlyToggle.classList.toggle("open");
    forecastEl.classList.toggle("open");
  });
}

// Search wiring
function initSearch() {
  let debounceTimer = null;

  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = searchInput.value;
    debounceTimer = setTimeout(() => searchCities(q), 250);
  });

  document.addEventListener("click", (e) => {
    if (!searchResults.contains(e.target) && e.target !== searchInput) {
      searchResults.style.display = "none";
    }
  });

  detectBtn.addEventListener("click", () => {
    initGeolocation();
  });
}

// Sky init stub – plug your multi-tier engine here
function initSky() {
  // Example:
  // SkyEngine.init(skyCanvas, { tier: 'high' });
}

// Init
function init() {
  initSky();
  initSearch();
  initVoiceSearch();
  initCollapsible();
  initGeolocation();
}

init();
