// sky/weatherEngine.js

export const WeatherEngine = {
  mode: 0,
  seed: 123.0,
  cloudLow: 0.5,
  cloudHigh: 0.3,
  cloudSpeed: 0.6,
  sunBase: 1.0,
  lightningBase: 0.0,
  fogDensity: 0.0,
  windDir: { x: 0.3, y: 0.0 },

  _target: null,
  _transitionStart: 0,
  _transitionDuration: 6.0,

  city: "Unknown",
  code: 0,
  _dayPhaseOffset: 0.0,

  map(code) {
    if ([0].includes(code)) return 0;
    if ([1, 2, 3].includes(code)) return 1;
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 2;
    if ([95, 96, 99].includes(code)) return 3;
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 4;
    return 5;
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
      case 0: return { low: 0.2, high: 0.1 };
      case 1: return { low: 0.6, high: 0.4 };
      case 2: return { low: 1.0, high: 0.5 };
      case 3: return { low: 1.5, high: 0.8 };
      case 4: return { low: 0.9, high: 0.6 };
      case 5: return { low: 0.3, high: 0.2 };
    }
    return { low: 0.5, high: 0.3 };
  },

  _cloudSpeedFor(code) {
    if ([0].includes(code)) return 0.3;
    if ([1, 2, 3].includes(code)) return 0.6;
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 1.0;
    if ([95, 96, 99].includes(code)) return 1.5;
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 0.7;
    return 0.4;
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
    return mode === 3 ? 1.0 : 0.0;
  },

  _fogFor(mode) {
    if (mode === 2) return 0.16;
    if (mode === 3) return 0.26;
    if (mode === 4) return 0.22;
    if (mode === 5) return 0.06;
    return 0.03;
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

    this._dayPhaseOffset = (seedHash % 86400) / 86400;

    const preset = this._cloudPreset(targetMode);

    this._target = {
      mode: targetMode,
      seed: (seedHash % 10000) / 10,
      cloudLow: preset.low,
      cloudHigh: preset.high,
      cloudSpeed: this._cloudSpeedFor(code),
      sunBase: this._sunBaseFor(targetMode),
      lightningBase: this._lightningBaseFor(targetMode),
      fogDensity: this._fogFor(targetMode),
      windDir: this._windFor(code)
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
    if (this._target) {
      const elapsed = timeSeconds - this._transitionStart;
      const tRaw = Math.min(elapsed / this._transitionDuration, 1.0);
      const t = tRaw * tRaw * (3 - 2 * tRaw);

      if (t >= 0.5) this.mode = this._target.mode;

      this.seed = this._lerp(this.seed, this._target.seed, t);
      this.cloudLow = this._lerp(this.cloudLow, this._target.cloudLow, t);
      this.cloudHigh = this._lerp(this.cloudHigh, this._target.cloudHigh, t);
      this.cloudSpeed = this._lerp(this.cloudSpeed, this._target.cloudSpeed, t);
      this.sunBase = this._lerp(this.sunBase, this._target.sunBase, t);
      this.lightningBase = this._lerp(
        this.lightningBase,
        this._target.lightningBase,
        t
      );
      this.fogDensity = this._lerp(this.fogDensity, this._target.fogDensity, t);
      this.windDir = this._lerpVec(this.windDir, this._target.windDir, t);

      if (tRaw >= 1.0) this._target = null;
    }

    let lightning = 0.0;
    if (this.mode === 3) {
      const f = Math.sin(timeSeconds * 5.7 + this.seed * 0.13);
      const g = Math.sin(timeSeconds * 9.1 + this.seed * 0.37);
      const pulse = Math.max(f, g);
      lightning = pulse > 0.92 ? this.lightningBase : 0.0;
    }

    const secondsInDay = 24 * 3600;
    const dayPhase =
      ((timeSeconds / secondsInDay) + this._dayPhaseOffset) % 1.0;

    const sunIntensity =
      this.sunBase * (0.4 + 0.6 * Math.sin(dayPhase * Math.PI));

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
