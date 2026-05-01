// sky/weatherEngine.js

export const WeatherEngine = {
  // current state
  mode: 0,
  seed: 123.0,
  cloudLow: 0.5,
  cloudHigh: 0.3,
  cloudSpeed: 0.6,
  sunBase: 1.0,
  lightningBase: 0.0,
  fogDensity: 0.0,
  windDir: { x: 0.3, y: 0.0 },

  // target state (for transitions)
  _target: null,
  _transitionStart: 0,
  _transitionDuration: 6.0, // a bit snappier

  city: "Unknown",
  code: 0,

  // pseudo day-phase offset per city so multiple tabs don't look identical
  _dayPhaseOffset: 0.0,

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

  _hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return h;
  },

  _cloudPreset(mode) {
    switch (mode) {
      case 0: return { low: 0.2, high: 0.1 }; // clear
      case 1: return { low: 0.6, high: 0.4 }; // partly / cloudy
      case 2: return { low: 1.0, high: 0.5 }; // rain
      case 3: return { low: 1.5, high: 0.8 }; // storm
      case 4: return { low: 0.9, high: 0.6 }; // snow
      case 5: return { low: 0.3, high: 0.2 }; // night
    }
    return { low: 0.5, high: 0.3 };
  },

  _cloudSpeedFor(code) {
    if ([0].includes(code)) return 0.3; // clear
    if ([1, 2, 3].includes(code)) return 0.6; // partly / cloudy
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 1.0; // rain
    if ([95, 96, 99].includes(code)) return 1.5; // storm
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 0.7; // snow
    return 0.4; // night / fallback
  },

  _sunBaseFor(mode) {
    if (mode === 0) return 1.0;
    if (mode === 1) return 0.8;
    if (mode === 2) return 0.45;
    if (mode === 4) return 0.6;
    if (mode === 5) return 0.0;
    if (mode === 3) return 0.25;
    return 0.7;
  },

  _lightningBaseFor(mode) {
    if (mode === 3) return 1.0;
    return 0.0;
  },

  _fogFor(mode) {
    if (mode === 2) return 0.16; // rain
    if (mode === 3) return 0.26; // storm
    if (mode === 4) return 0.22; // snow
    if (mode === 5) return 0.06; // night haze
    return 0.03; // clear / cloudy
  },

  _windFor(code) {
    const baseAngle =
      (this._hashString(this.city + ":" + code) % 360) * (Math.PI / 180);
    let strength = 0.3;
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) strength = 0.7;
    if ([95, 96, 99].includes(code)) strength = 1.0;
    if ([71, 73, 75, 77, 85, 86].includes(code)) strength = 0.5;

    return {
      x: Math.cos(baseAngle) * strength,
      y: Math.sin(baseAngle) * strength
    };
  },

  setFromAPI(city, code) {
    this.city = city || "Unknown";
    this.code = code;

    const targetMode = this.map(code);
    const seedHash = this._hashString(this.city + ":" + code);
    const seed = (seedHash % 10000) / 10;
    const preset = this._cloudPreset(targetMode);
    const cloudSpeed = this._cloudSpeedFor(code);
    const sunBase = this._sunBaseFor(targetMode);
    const lightningBase = this._lightningBaseFor(targetMode);
    const fogDensity = this._fogFor(targetMode);
    const windDir = this._windFor(code);

    // pseudo day-phase offset per city (keeps cycles de-synced)
    this._dayPhaseOffset = (seedHash % 86400) / 86400;

    this._target = {
      mode: targetMode,
      seed,
      cloudLow: preset.low,
      cloudHigh: preset.high,
      cloudSpeed,
      sunBase,
      lightningBase,
      fogDensity,
      windDir
    };
    this._transitionStart = performance.now() / 1000;
  },

  _lerp(a, b, t) {
    return a + (b - a) * t;
  },

  _lerpVec(a, b, t) {
    return {
      x: this._lerp(a.x, b.x, t),
      y: this._lerp(a.y, b.y, t)
    };
  },

  update(timeSeconds) {
    // transition between weather states
    if (this._target) {
      const elapsed = timeSeconds - this._transitionStart;
      const tRaw = Math.min(elapsed / this._transitionDuration, 1.0);
      // ease in/out for smoother cloud morph
      const t = tRaw * tRaw * (3 - 2 * tRaw);

      if (t >= 0.5) this.mode = this._target.mode;

      this.seed        = this._lerp(this.seed,        this._target.seed,        t);
      this.cloudLow    = this._lerp(this.cloudLow,    this._target.cloudLow,    t);
      this.cloudHigh   = this._lerp(this.cloudHigh,   this._target.cloudHigh,   t);
      this.cloudSpeed  = this._lerp(this.cloudSpeed,  this._target.cloudSpeed,  t);
      this.sunBase     = this._lerp(this.sunBase,     this._target.sunBase,     t);
      this.lightningBase = this._lerp(
        this.lightningBase,
        this._target.lightningBase,
        t
      );
      this.fogDensity  = this._lerp(this.fogDensity,  this._target.fogDensity,  t);
      this.windDir     = this._lerpVec(this.windDir,  this._target.windDir,     t);

      if (tRaw >= 1.0) this._target = null;
    }

    // storm lightning: irregular but cheap
    let lightning = 0.0;
    if (this.mode === 3) {
      const f = Math.sin(timeSeconds * 5.7 + this.seed * 0.13);
      const g = Math.sin(timeSeconds * 9.1 + this.seed * 0.37);
      const pulse = Math.max(f, g);
      lightning = pulse > 0.92 ? this.lightningBase : 0.0;
    }

    // dayPhase: 24h loop with per-city offset
    const secondsInDay = 24 * 3600;
    const dayPhase = ((timeSeconds / secondsInDay) + this._dayPhaseOffset) % 1.0;

    // slight modulation of sun by dayPhase (shaders already warm/cool)
    const sunIntensity = this.sunBase * (0.4 + 0.6 * Math.sin(dayPhase * Math.PI));

    return {
      mode: this.mode,
      seed: this.seed,
      cloudLow: this.cloudLow,
      cloudHigh: this.cloudHigh,
      cloudSpeed: this.cloudSpeed,
      sunIntensity,
      lightning,
      fogDensity: this.fogDensity,
      windX: this.windDir.x,
      windY: this.windDir.y,
      dayPhase
    };
  }
};
