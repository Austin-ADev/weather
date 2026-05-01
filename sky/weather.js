export const Weather = {
  map(code) {
    if ([0].includes(code)) return 0; // clear
    if ([1, 2, 3].includes(code)) return 1; // partly / cloudy
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 2; // rain
    if ([95, 96, 99].includes(code)) return 3; // storm
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 4; // snow
    return 5; // night / fallback
  },

  describe(code) {
    const map = {
      0: "Clear",
      1: "Mostly Clear",
      2: "Partly Cloudy",
      3: "Cloudy",
      51: "Light Drizzle",
      53: "Drizzle",
      55: "Heavy Drizzle",
      61: "Light Rain",
      63: "Rain",
      65: "Heavy Rain",
      80: "Rain Showers",
      81: "Heavy Showers",
      82: "Violent Showers",
      95: "Thunderstorm",
      96: "Thunderstorm",
      99: "Severe Storm",
      71: "Light Snow",
      73: "Snow",
      75: "Heavy Snow",
      85: "Snow Showers",
      86: "Heavy Snow Showers"
    };
    return map[code] || "Unknown";
  },

  cloudSpeed(code) {
    if ([0].includes(code)) return 0.3; // clear
    if ([1, 2, 3].includes(code)) return 0.6; // partly / cloudy
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 1.0; // rain
    if ([95, 96, 99].includes(code)) return 1.4; // storm
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 0.7; // snow
    return 0.4; // night / fallback
  },

  seedFor(city, code) {
    let h = 0;
    const s = (city || "city") + ":" + code;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return (h % 10000) / 10;
  }
};
