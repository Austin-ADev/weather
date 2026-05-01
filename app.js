import { Sky } from "./sky/sky.js";
import { WeatherEngine } from "./sky/weatherEngine.js";

const HISTORY_KEY = "weatherSearchHistory";

let searchEl;
let resultsBox;
let history = [];
let nearbyCities = [];
let searchDebounce = null;

async function init() {
  const canvas = document.getElementById("sky");
  const gl = canvas.getContext("webgl");
  if (!gl) {
    alert("WebGL not supported");
    return;
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  addEventListener("resize", resize);

  const shaderSets = [
    { tier: 3, vert: "shaders/ultra.vert?v=1", frag: "shaders/ultraC.frag?v=1" },
    { tier: 2, vert: "shaders/ultra.vert?v=1", frag: "shaders/ultraB.frag?v=1" },
    { tier: 1, vert: "shaders/high.vert?v=1", frag: "shaders/high.frag?v=1" },
    { tier: 0, vert: "shaders/high.vert?v=1", frag: "shaders/perf.frag?v=1" }
  ];

  await Sky.init(gl, shaderSets);

  window.setTier = async function (tier) {
    console.log("[WeatherShader]: Switching tier to", tier);
    await Sky.switchTier(tier);
  };

  // --- Search wiring ---
  searchEl = document.getElementById("citySearch");
  resultsBox = document.getElementById("searchResults");

  loadHistory();

  if (searchEl && resultsBox) {
    searchEl.addEventListener("input", onSearchInput);
    searchEl.addEventListener("keydown", onSearchKeyDown);

    document.addEventListener("click", e => {
      if (!resultsBox.contains(e.target) && e.target !== searchEl) {
        hideResults();
      }
    });

    searchEl.addEventListener("focus", () => {
      if (!searchEl.value.trim()) {
        showHistoryAndNearby();
      }
    });
  }

  // Voice search (optional)
  const voiceBtn = document.getElementById("voiceSearch");
  if (voiceBtn && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    voiceBtn.onclick = () => {
      rec.start();
    };

    rec.onresult = e => {
      const text = e.results[0][0].transcript;
      if (searchEl) {
        searchEl.value = text;
        triggerSearch(text);
      }
    };
  }

  // Manual search fallback
  if (searchEl) {
    searchEl.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        // handled in onSearchKeyDown
      }
    });
  }

  const detectBtn = document.getElementById("detectLocation");
  if (detectBtn) detectBtn.onclick = () => detectLocation();

  // Auto detect on load
  detectLocation();

  function render() {
    requestAnimationFrame(render);
    Sky.update();
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  render();
}

// ---------- Search / suggestions / history ----------

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) history = JSON.parse(raw);
  } catch {
    history = [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
  } catch {
    // ignore
  }
}

function addToHistory(entry) {
  const key = `${entry.name},${entry.country}`;
  history = history.filter(h => `${h.name},${h.country}` !== key);
  history.unshift(entry);
  if (history.length > 10) history.length = 10;
  saveHistory();
}

function onSearchInput(e) {
  const q = e.target.value.trim();
  if (!q) {
    showHistoryAndNearby();
    return;
  }
  if (q.length < 2) {
    hideResults();
    return;
  }

  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    triggerSearch(q);
  }, 220);
}

async function triggerSearch(q) {
  if (!resultsBox) return;

  try {
    const geo = await fetch(
      "https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&name=" + encodeURIComponent(q)
    ).then(r => r.json());

    if (!geo.results || geo.results.length === 0) {
      resultsBox.style.display = "none";
      return;
    }

    // sort by population desc if available
    const sorted = geo.results.slice().sort((a, b) => {
      const pa = a.population || 0;
      const pb = b.population || 0;
      return pb - pa;
    });

    resultsBox.innerHTML = "";
    resultsBox.style.display = "block";

    sorted.forEach(place => {
      const div = document.createElement("div");
      div.className = "search-item";
      const region = place.admin1 ? `, ${place.admin1}` : "";
      div.textContent = `${place.name}${region}, ${place.country}`;
      div.onclick = () => {
        hideResults();
        if (searchEl) searchEl.value = place.name;
        loadWeather(place.latitude, place.longitude, place.name, place.country);
        addToHistory({
          name: place.name,
          country: place.country,
          latitude: place.latitude,
          longitude: place.longitude
        });
      };
      resultsBox.appendChild(div);
    });
  } catch (e) {
    console.error(e);
  }
}

function onSearchKeyDown(e) {
  if (e.key === "Enter") {
    if (!resultsBox) return;
    const first = resultsBox.querySelector(".search-item");
    if (first) {
      first.click();
    } else if (searchEl) {
      loadWeatherByName(searchEl.value);
    }
    hideResults();
  }
}

function hideResults() {
  if (resultsBox) {
    resultsBox.style.display = "none";
  }
}

function showHistoryAndNearby() {
  if (!resultsBox) return;

  resultsBox.innerHTML = "";
  let hasContent = false;

  if (history.length) {
    const header = document.createElement("div");
    header.className = "search-item";
    header.style.opacity = "0.7";
    header.textContent = "Recent";
    header.style.cursor = "default";
    resultsBox.appendChild(header);

    history.forEach(h => {
      const div = document.createElement("div");
      div.className = "search-item";
      div.textContent = `${h.name}, ${h.country}`;
      div.onclick = () => {
        hideResults();
        if (searchEl) searchEl.value = h.name;
        loadWeather(h.latitude, h.longitude, h.name, h.country);
      };
      resultsBox.appendChild(div);
    });
    hasContent = true;
  }

  if (nearbyCities.length) {
    const header = document.createElement("div");
    header.className = "search-item";
    header.style.opacity = "0.7";
    header.textContent = hasContent ? "Nearby" : "Nearby cities";
    header.style.cursor = "default";
    resultsBox.appendChild(header);

    nearbyCities.forEach(p => {
      const div = document.createElement("div");
      div.className = "search-item";
      div.textContent = `${p.name}, ${p.country}`;
      div.onclick = () => {
        hideResults();
        if (searchEl) searchEl.value = p.name;
        loadWeather(p.latitude, p.longitude, p.name, p.country);
        addToHistory(p);
      };
      resultsBox.appendChild(div);
    });
    hasContent = true;
  }

  resultsBox.style.display = hasContent ? "block" : "none";
}

// ---------- Location / radar / moon / icons ----------

async function detectLocation() {
  if (!navigator.geolocation) {
    loadWeatherByName("Indianapolis");
    return;
  }

  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    try {
      const geo = await fetch(
        `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=5`
      ).then(r => r.json());

      if (!geo.results || !geo.results.length) {
        loadWeatherByName("Indianapolis");
        return;
      }

      const main = geo.results[0];
      nearbyCities = geo.results.map(r => ({
        name: r.name,
        country: r.country,
        latitude: r.latitude,
        longitude: r.longitude
      }));

      await loadWeather(main.latitude, main.longitude, main.name, main.country);
      addToHistory({
        name: main.name,
        country: main.country,
        latitude: main.latitude,
        longitude: main.longitude
      });
    } catch (e) {
      console.error(e);
      loadWeatherByName("Indianapolis");
    }
  }, () => loadWeatherByName("Indianapolis"));
}

async function loadWeatherByName(city) {
  try {
    const geo = await fetch(
      "https://geocoding-api.open-meteo.com/v1/search?count=1&name=" + encodeURIComponent(city)
    ).then(r => r.json());
    if (!geo.results || !geo.results.length) return;

    const { latitude, longitude, name, country } = geo.results[0];
    await loadWeather(latitude, longitude, name, country);
    addToHistory({ name, country, latitude, longitude });
  } catch (e) {
    console.error(e);
  }
}

function buildRadarURL(lat, lon) {
  const zoom = 6;
  return `https://www.rainviewer.com/map.html?loc=${lat},${lon},${zoom}&oFa=1&oC=1&oU=1&oCS=1&oF=1&c=3`;
}

function moonPhaseLabel(date) {
  const synodicMonth = 29.53058867;
  const knownNewMoon = new Date("2000-01-06T18:14:00Z").getTime();
  const now = date.getTime();
  const daysSince = (now - knownNewMoon) / (1000 * 60 * 60 * 24);
  const phase = (daysSince % synodicMonth) / synodicMonth;

  if (phase < 0.03 || phase > 0.97) return "New Moon";
  if (phase < 0.22) return "Waxing Crescent";
  if (phase < 0.28) return "First Quarter";
  if (phase < 0.47) return "Waxing Gibbous";
  if (phase < 0.53) return "Full Moon";
  if (phase < 0.72) return "Waning Gibbous";
  if (phase < 0.78) return "Last Quarter";
  return "Waning Crescent";
}

function setIconForCode(code) {
  const container = document.getElementById("currentIcon");
  if (!container) return;
  container.innerHTML = "";

  const cloud = document.createElement("div");
  const sun = document.createElement("div");

  if (code === 0) {
    sun.className = "icon-sun";
    container.appendChild(sun);
    return;
  }

  if ([1, 2, 3].includes(code)) {
    sun.className = "icon-sun";
    cloud.className = "icon-cloud";
    container.appendChild(sun);
    container.appendChild(cloud);
    return;
  }

  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
    cloud.className = "icon-cloud";
    container.appendChild(cloud);
    for (let i = 0; i < 3; i++) {
      const drop = document.createElement("div");
      drop.className = "icon-rain-drop";
      container.appendChild(drop);
    }
    return;
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    cloud.className = "icon-cloud";
    container.appendChild(cloud);
    for (let i = 0; i < 2; i++) {
      const flake = document.createElement("div");
      flake.className = "icon-snow-flake";
      container.appendChild(flake);
    }
    return;
  }

  if ([95, 96, 99].includes(code)) {
    cloud.className = "icon-cloud";
    container.appendChild(cloud);
    const bolt = document.createElement("div");
    bolt.className = "icon-storm-bolt";
    container.appendChild(bolt);
    return;
  }

  cloud.className = "icon-cloud";
  container.appendChild(cloud);
}

async function loadWeather(latitude, longitude, name, country) {
  try {
    const w = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&timezone=auto&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,relative_humidity_2m,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset`
    ).then(r => r.json());

    const c = w.current;

    document.querySelector(".city-name").textContent = `${name}, ${country}`;
    document.getElementById("localtime").textContent = c.time;

    document.querySelector(".temp").textContent = `${Math.round(c.temperature_2m)}°F`;
    document.querySelector(".condition").textContent = WeatherEngine.describe(c.weather_code);

    document.getElementById("humidity").textContent =
      (c.relative_humidity_2m ?? "--") + "%";

    document.getElementById("wind").textContent =
      (c.wind_speed_10m ?? "--") + " mph";

    document.getElementById("feels").textContent =
      (c.apparent_temperature != null ? Math.round(c.apparent_temperature) : "--") + "°F";

    setIconForCode(c.weather_code);

    // 24h forecast
    const fc = document.getElementById("forecast");
    if (fc) {
      fc.innerHTML = "";
      for (let i = 0; i < 24 && i < w.hourly.time.length; i++) {
        const hourStr = w.hourly.time[i].split("T")[1];
        const temp = Math.round(w.hourly.temperature_2m[i]);
        const code = w.hourly.weather_code[i];
        const desc = WeatherEngine.describe(code);

        fc.innerHTML += `
          <div class="forecast-hour">
            <span>${hourStr}</span>
            <span>${temp}°F</span>
            <span>${desc}</span>
          </div>
        `;
      }
    }

    // 7‑day forecast
    const df = document.getElementById("dailyForecast");
    if (df) {
      df.innerHTML = "";
      for (let i = 0; i < w.daily.time.length; i++) {
        const dateStr = w.daily.time[i];
        const maxT = Math.round(w.daily.temperature_2m_max[i]);
        const minT = Math.round(w.daily.temperature_2m_min[i]);
        const code = w.daily.weather_code[i];
        const desc = WeatherEngine.describe(code);

        const date = new Date(dateStr + "T00:00:00");
        const dayName = date.toLocaleDateString(undefined, { weekday: "short" });

        df.innerHTML += `
          <div class="daily-row">
            <span>${dayName}</span>
            <span>${minT}° / ${maxT}°</span>
            <span>${desc}</span>
          </div>
        `;
      }
    }

    // Radar
    const radarFrame = document.getElementById("radarFrame");
    if (radarFrame) {
      radarFrame.src = buildRadarURL(latitude, longitude);
    }

    // Moon phase
    const moonLabel = document.getElementById("moonLabel");
    if (moonLabel) {
      const localDate = new Date(c.time);
      moonLabel.textContent = moonPhaseLabel(localDate);
    }

    // Feed weather into sky engine
    WeatherEngine.setFromAPI(name, c.weather_code);

  } catch (e) {
    console.error(e);
  }
}

init();
