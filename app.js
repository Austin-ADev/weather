import { Sky } from "./sky/sky.js";
import { Weather } from "./sky/weather.js";

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

  // console control: setTier(0..3)
  window.setTier = async function (tier) {
    console.log("[WeatherShader] Switching tier to", tier);
    await Sky.switchTier(tier);
  };

  const search = document.getElementById("citySearch");
  search.addEventListener("keydown", e => {
    if (e.key === "Enter") loadWeather(e.target.value);
  });

  loadWeather("Indianapolis");

  function render() {
    requestAnimationFrame(render);
    Sky.update();
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  render();
}

async function loadWeather(city) {
  try {
    const geo = await fetch(
      "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(city)
    ).then(r => r.json());
    if (!geo.results || !geo.results.length) return;

    const { latitude, longitude, name, country } = geo.results[0];

    const w = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`
    ).then(r => r.json());

    const c = w.current_weather;

    document.querySelector(".city-name").textContent = `${name}, ${country}`;
    document.querySelector(".temp").textContent = `${Math.round(c.temperature)}°F`;
    document.querySelector(".condition").textContent = Weather.describe(c.weathercode);
    document.getElementById("humidity").textContent =
      (c.relative_humidity ?? "--") + "%";
    document.getElementById("wind").textContent =
      (c.windspeed ?? "--") + " mph";
    document.getElementById("feels").textContent =
      (c.apparent_temperature != null ? Math.round(c.apparent_temperature) : "--") + "°F";

    const mode = Weather.map(c.weathercode);
    const speed = Weather.cloudSpeed(c.weathercode);
    const seed = Weather.seedFor(city, c.weathercode);

    Sky.setMode(mode);
    Sky.setCloudSpeed(speed);
    Sky.setSeed(seed);
  } catch (e) {
    console.error(e);
  }
}

init();
