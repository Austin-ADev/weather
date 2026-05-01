export const Weather = {
  map(code){
    if([0].includes(code)) return 0; // clear
    if([1,2,3].includes(code)) return 1; // partly
    if([51,53,55,61,63,65,80,81,82].includes(code)) return 2; // rain
    if([95,96,99].includes(code)) return 3; // storm
    if([71,73,75,77,85,86].includes(code)) return 4; // snow
    return 5; // fallback night
  },

  describe(code){
    const map = {
      0:"Clear",
      1:"Mostly Clear",
      2:"Partly Cloudy",
      3:"Cloudy",
      51:"Light Drizzle",
      61:"Light Rain",
      63:"Rain",
      65:"Heavy Rain",
      80:"Rain Showers",
      95:"Thunderstorm",
      96:"Thunderstorm",
      99:"Severe Storm",
      71:"Light Snow",
      73:"Snow",
      75:"Heavy Snow",
      85:"Snow Showers"
    };
    return map[code] || "Unknown";
  }
};
