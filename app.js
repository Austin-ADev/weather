import { Sky } from "./sky/sky.js";
import { Weather } from "./sky/weather.js";

async function init(){
  const canvas = document.getElementById("sky");
  const gl = canvas.getContext("webgl");

  function resize(){
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    gl.viewport(0,0,canvas.width,canvas.height);
  }
  resize();
  addEventListener("resize", resize);

  const shaderSets = [
    { tier:2, vert:"shaders/ultra.vert?v=999", frag:"shaders/ultra.frag?v=999" },
    { tier:1, vert:"shaders/high.vert?v=999",  frag:"shaders/high.frag?v=999" },
    { tier:0, vert:"shaders/perf.vert?v=999",  frag:"shaders/perf.frag?v=999" }
  ];

  await Sky.init(gl, shaderSets);

  // expose tier switching in console
  window.setTier = async function(tier){
    Sky.setTier(tier);
    // re-init with new tier
    await Sky.init(gl, shaderSets);
  };

  document.getElementById("citySearch").addEventListener("keydown", e=>{
    if(e.key === "Enter") loadWeather(e.target.value);
  });

  loadWeather("New York");

  function render(){
    requestAnimationFrame(render);
    Sky.update();
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  render();
}

async function loadWeather(city){
  const geo = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + city).then(r=>r.json());
  if(!geo.results) return;

  const { latitude, longitude, name, country } = geo.results[0];

  const w = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`
  ).then(r=>r.json());

  const c = w.current_weather;

  document.querySelector(".city-name").textContent = `${name}, ${country}`;
  document.querySelector(".temp").textContent = `${Math.round(c.temperature)}°F`;
  document.querySelector(".condition").textContent = Weather.describe(c.weathercode);
  document.getElementById("humidity").textContent = c.relative_humidity + "%";
  document.getElementById("wind").textContent = c.windspeed + " mph";
  document.getElementById("feels").textContent = Math.round(c.apparent_temperature) + "°F";

  Sky.setMode(Weather.map(c.weathercode));
}

init();
