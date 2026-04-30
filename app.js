// ============================================================
// API
// ============================================================
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search?name=";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

// ============================================================
// ELEMENTS
// ============================================================
const cityInput = document.getElementById("citySearch");
const cityNameEl = document.querySelector(".city-name");
const tempEl = document.querySelector(".temp");
const conditionEl = document.querySelector(".condition");
const detailBoxes = document.querySelectorAll(".detail-box strong");

const sky = {
  base: document.querySelector(".sky-base"),
  clouds: document.querySelector(".sky-clouds"),
  fog: document.querySelector(".sky-fog"),
  rain: document.querySelector(".sky-rain"),
  snow: document.querySelector(".sky-snow"),
  lightning: document.querySelector(".sky-lightning"),
  sun: document.querySelector(".sky-sun"),
  stars: document.querySelector(".sky-stars")
};

// ============================================================
// SKYBOX ASSETS (CGI)
// ============================================================
const SKYBOX = {
  clear: {
    base: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/clear/sky.jpg",
    clouds: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/clear/clouds.png",
    sun: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/clear/sun.png"
  },
  cloudy: {
    base: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/cloudy/sky.jpg",
    clouds: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/cloudy/clouds.png",
    fog: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/cloudy/fog.png"
  },
  rain: {
    base: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/rain/sky.jpg",
    clouds: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/rain/clouds.png",
    rain: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/rain/rain.png"
  },
  storm: {
    base: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/storm/sky.jpg",
    clouds: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/storm/clouds.png",
    lightning: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/storm/lightning.png"
  },
  snow: {
    base: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/snow/sky.jpg",
    clouds: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/snow/clouds.png",
    snow: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/snow/snow.png"
  },
  night: {
    base: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/night/sky.jpg",
    stars: "https://raw.githubusercontent.com/itsjustaustin/skybox/main/night/stars.png"
  }
};

// ============================================================
// WEATHER CODE → MODE
// ============================================================
function mapCondition(code, isNight) {
  if (isNight) return "night";
  if ([95, 96, 99].includes(code)) return "storm";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([2, 3].includes(code)) return "cloudy";
  return "clear";
}

// ============================================================
// APPLY SKYBOX
// ============================================================
function applySkybox(mode) {
  // Reset all layers
  Object.values(sky).forEach(layer => layer.style.opacity = 0);

  const set = SKYBOX[mode];

  // Base sky
  sky.base.style.backgroundImage = `url(${set.base})`;
  sky.base.style.opacity = 1;

  // Clouds
  if (set.clouds) {
    sky.clouds.style.backgroundImage = `url(${set.clouds})`;
    sky.clouds.style.opacity = 1;
  }

  // Fog
  if (set.fog) {
    sky.fog.style.backgroundImage = `url(${set.fog})`;
    sky.fog.style.opacity = 0.4;
  }

  // Rain
  if (set.rain) {
    sky.rain.style.backgroundImage = `url(${set.rain})`;
    sky.rain.style.opacity = 0.8;
  }

  // Snow
  if (set.snow) {
    sky.snow.style.backgroundImage = `url(${set.snow})`;
    sky.snow.style.opacity = 0.8;
  }

  // Lightning
  if (set.lightning) {
    sky.lightning.style.backgroundImage = `url(${set.lightning})`;
    sky.lightning.style.animation = "flash 6s infinite";
    sky.lightning.style.opacity = 1;
  }

  // Sun
  if (set.sun) {
    sky.sun.style.backgroundImage = `url(${set.sun})`;
    sky.sun.style.opacity = 1;
  }

  // Stars
  if (set.stars) {
    sky.stars.style.backgroundImage = `url(${set.stars})`;
    sky.stars.style.opacity = 1;
  }
}

// ============================================================
// FETCH WEATHER
// ============================================================
async function fetchWeather(city) {
  const geoRes = await fetch(GEO_URL + encodeURIComponent(city));
  const geo = await geoRes.json();

  if (!geo.results) return;

  const { latitude, longitude, name, country } = geo.results[0];

  const weatherRes = await fetch(
    `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`
  );

  const weather = await weatherRes.json();
  const current = weather.current_weather;

  const mode = mapCondition(current.weathercode, current.is_day === 0);
  applySkybox(mode);

  cityNameEl.textContent = `${name}, ${country}`;
  tempEl.textContent = `${Math.round(current.temperature)}°F`;
  conditionEl.textContent = current.weathercode;
  detailBoxes[1].textContent = `${Math.round(current.windspeed)} mph`;
  detailBoxes[2].textContent = `${Math.round(current.temperature)}°F`;
}

// ============================================================
// SEARCH
// ============================================================
cityInput.addEventListener("keydown", e => {
  if (e.key === "Enter") fetchWeather(cityInput.value);
});

// Initial load
fetchWeather("New York");
