// utils.js
export const UNIT_KEY = "weather_units";

export function getUnits() {
  return localStorage.getItem(UNIT_KEY) || "us";
}

export function setUnits(mode) {
  localStorage.setItem(UNIT_KEY, mode);
}

export function getUnitParams() {
  const mode = getUnits();
  return mode === "metric"
    ? { temp: "celsius", wind: "kmh", precip: "mm", tempSymbol: "°C", windSymbol: "km/h" }
    : { temp: "fahrenheit", wind: "mph", precip: "inch", tempSymbol: "°F", windSymbol: "mph" };
}
