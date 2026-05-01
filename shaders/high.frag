precision mediump float;

varying vec2 vUv;

uniform float uTime;
uniform vec2  uResolution;
uniform int   uMode;
uniform int   uQuality;
uniform float uSeed;
uniform float uCloudLow;
uniform float uCloudHigh;
uniform float uSunIntensity;
uniform float uLightning;
uniform float uCloudSpeed;
uniform float uFogDensity;
uniform vec2  uWind;
uniform float uDayPhase;

// --------------------------------------------------------
// Utility: hash / noise / fbm
// --------------------------------------------------------

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
           (c - a) * u.y * (1.0 - u.x) +
           (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
    }
    return v;
}

// --------------------------------------------------------
// Sky base color per mode
// --------------------------------------------------------

vec3 skyColor(float h, int mode) {
    if (mode == 5) {
        // night
        return mix(vec3(0.02, 0.03, 0.08), vec3(0.01, 0.02, 0.05), h);
    }
    if (mode == 3) {
        // storm
        return mix(vec3(0.18, 0.2, 0.25), vec3(0.05, 0.05, 0.08), h);
    }
    if (mode == 2) {
        // rain
        return mix(vec3(0.35, 0.4, 0.5), vec3(0.1, 0.1, 0.15), h);
    }
    if (mode == 4) {
        // snow
        return mix(vec3(0.85, 0.9, 1.0), vec3(0.6, 0.7, 0.9), h);
    }
    if (mode == 1) {
        // partly / cloudy
        return mix(vec3(0.6, 0.75, 1.0), vec3(0.3, 0.4, 0.7), h);
    }
    // clear
    return mix(vec3(0.55, 0.75, 1.0), vec3(0.2, 0.35, 0.7), h);
}

// --------------------------------------------------------
// Sun rendering (2D, driven by dayPhase)
// --------------------------------------------------------

vec3 addSun(vec3 col, vec2 uv, float dayPhase, int mode, float sunIntensity) {
    if (mode == 5) return col; // night: no sun

    float angle = dayPhase * 6.2831853;
    vec2 sunPos = vec2(
        0.5 + cos(angle) * 0.45,
        0.2 + sin(angle) * 0.35
    );

    float d = distance(uv, sunPos);
    float core  = smoothstep(0.05, 0.02, d);
    float halo  = smoothstep(0.25, 0.05, d);
    float bloom = smoothstep(0.6, 0.2, d);

    vec3 sunColor = vec3(1.0, 0.96, 0.88) * sunIntensity;

    col += sunColor * core  * 2.0;
    col += sunColor * halo  * 0.5;
    col += sunColor * bloom * 0.25;

    return col;
}

// --------------------------------------------------------
// Stars (night)
// --------------------------------------------------------

float stars(vec2 uv, float t) {
    float s = 0.0;
    vec2 p = uv * 80.0;
    s += step(0.995, fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453));
    s += step(0.997, fract(sin(dot(p * 1.7, vec2(39.3467, 11.135))) * 24634.6345));
    return s;
}

// --------------------------------------------------------
// Rain (2D streaks, wind‑aware)
// --------------------------------------------------------

float rain(vec2 uv, float t, vec2 wind) {
    uv.y += t * 2.5;
    uv.x += sin(uv.y * 20.0) * 0.03;
    uv += wind * 0.4;

    float n = fract(sin(dot(uv * vec2(40.0, 6.0), vec2(12.9898, 78.233))) * 43758.5453);
    float streak = smoothstep(0.85, 1.0, n);
    return streak;
}

// --------------------------------------------------------
// Lightning flash
// --------------------------------------------------------

float lightningFlash(float t, float intensity) {
    float f = fract(t * 0.7);
    float flash = step(f, 0.02) + step(abs(f - 0.18), 0.02);
    return flash * intensity;
}

// --------------------------------------------------------
// Time-of-day & weather tints for clouds (PBR-ish)
// --------------------------------------------------------

vec3 timeOfDayTint(float dayPhase, int mode) {
    // 0..1: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset, 1 = midnight
    float sunrise = smoothstep(0.0, 0.15, dayPhase);
    float sunset  = smoothstep(1.0, 0.85, dayPhase);
    float night   = step(dayPhase, 0.05) + step(0.95, dayPhase);

    vec3 sunriseTint = vec3(1.25, 0.7, 0.6);  // orange/pink
    vec3 sunsetTint  = vec3(1.3, 0.75, 0.65); // warmer orange/pink
    vec3 nightTint   = vec3(0.6, 0.7, 1.0);   // bluish
    vec3 dayTint     = vec3(1.0);

    vec3 tint = dayTint;
    tint = mix(tint, sunriseTint, sunrise);
    tint = mix(tint, sunsetTint,  sunset);
    tint = mix(tint, nightTint,   clamp(night, 0.0, 1.0));

    // Slightly reduce tint at night for non-night modes
    if (mode != 5) {
        tint = mix(tint, dayTint, 0.3);
    }

    return tint;
}

vec3 weatherCloudBaseColor(int mode) {
    if (mode == 2) { // rain
        return vec3(0.78, 0.8, 0.83);
    }
    if (mode == 3) { // storm
        return vec3(0.45, 0.48, 0.52);
    }
    if (mode == 4) { // snow
        return vec3(0.95, 0.97, 1.0);
    }
    if (mode == 5) { // night
        return vec3(0.6, 0.65, 0.7);
    }
    if (mode == 1) { // partly / cloudy
        return vec3(0.92, 0.95, 0.98);
    }
    // clear
    return vec3(1.0);
}

// Simple physically-inspired lighting term: sun direction vs "cloud normal"
float cloudLighting(vec2 uv, float dayPhase, float density) {
    // approximate sun direction on dome
    float angle = dayPhase * 6.2831853;
    vec3 sunDir = normalize(vec3(cos(angle), sin(angle), 0.4));

    // fake normal from uv (curved dome)
    vec3 n = normalize(vec3(uv - 0.5, 0.7));

    float ndotl = clamp(dot(n, sunDir), 0.0, 1.0);

    // more forward scattering for thin clouds, softer for dense
    float scatter = pow(ndotl, mix(1.0, 4.0, density));
    return scatter;
}

// --------------------------------------------------------
// Main
// --------------------------------------------------------

void main() {
    float t = uTime;
    float h = vUv.y;

    if (uResolution.x <= 0.0 || uResolution.y <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float aspect = uResolution.x / max(uResolution.y, 1.0);

    // base sky
    vec3 col = skyColor(h, uMode);

    // unique seed per mode
    float seed = uSeed + float(uMode) * 37.123;

    // cloud drift (wind‑aware, stronger + layered)
    float speedMul = 0.6 + uCloudSpeed * 0.8;

    vec2 driftLow = vec2(
        sin(t * 0.03 * speedMul + seed) * 0.25 + uWind.x * 0.35,
        cos(t * 0.02 * speedMul + seed * 1.3) * 0.18 + uWind.y * 0.25
    );
    vec2 driftMid = vec2(
        sin(t * 0.05 * speedMul + seed * 0.7) * 0.18 + uWind.x * 0.25,
        cos(t * 0.035 * speedMul + seed * 1.9) * 0.14 + uWind.y * 0.18
    );
    vec2 driftHigh = vec2(
        sin(t * 0.08 * speedMul + seed * 1.7) * 0.12 + uWind.x * 0.18,
        cos(t * 0.06 * speedMul + seed * 2.3) * 0.1  + uWind.y * 0.12
    );

    // slight refraction for clouds
    vec2 baseUV = vUv;
    float refractStrength = 0.0015 + float(uQuality) * 0.0007;
    vec2 refractUV = baseUV + vec2(
        noise(baseUV * 6.0 + t * 0.2 + seed),
        noise(baseUV * 6.0 - t * 0.17 + seed * 1.3)
    ) * refractStrength;

    // ----------------------------------------------------
    // Multi-layer clouds: low / mid / high
    // ----------------------------------------------------

    float lowNoise  = fbm(refractUV * (2.5 + float(uQuality)) + driftLow  + seed * 0.7);
    float midNoise  = fbm(refractUV * (4.5 + float(uQuality)) + driftMid  + seed * 1.1);
    float highNoise = fbm(refractUV * (8.0 + float(uQuality)) + driftHigh + seed * 1.7);

    float lowCloud  = 0.0;
    float midCloud  = 0.0;
    float highCloud = 0.0;

    if (uMode == 0) {
        // clear
        lowCloud  = smoothstep(0.75, 0.95, lowNoise)  * 0.15;
        midCloud  = smoothstep(0.8,  0.96, midNoise)  * 0.1;
        highCloud = smoothstep(0.82, 0.97, highNoise) * 0.2;
    } else if (uMode == 1) {
        // partly / cloudy
        lowCloud  = smoothstep(0.5, 0.78, lowNoise)  * uCloudLow;
        midCloud  = smoothstep(0.55, 0.8, midNoise)  * (uCloudLow * 0.7);
        highCloud = smoothstep(0.6, 0.85, highNoise) * (uCloudHigh * 0.8);
    } else if (uMode == 2) {
        // rain
        lowCloud  = smoothstep(0.4, 0.7, lowNoise)   * uCloudLow * 1.3;
        midCloud  = smoothstep(0.5, 0.78, midNoise)  * uCloudLow;
        highCloud = smoothstep(0.6, 0.85, highNoise) * uCloudHigh * 0.6;
    } else if (uMode == 3) {
        // storm
        lowCloud  = smoothstep(0.35, 0.65, lowNoise)  * uCloudLow * 1.6;
        midCloud  = smoothstep(0.45, 0.7,  midNoise)  * uCloudLow * 1.2;
        highCloud = smoothstep(0.55, 0.8,  highNoise) * uCloudHigh * 0.7;
    } else if (uMode == 4) {
        // snow
        lowCloud  = smoothstep(0.45, 0.72, lowNoise)  * uCloudLow * 1.1;
        midCloud  = smoothstep(0.55, 0.8,  midNoise)  * uCloudLow;
        highCloud = smoothstep(0.6,  0.85, highNoise) * uCloudHigh;
    } else if (uMode == 5) {
        // night
        lowCloud  = smoothstep(0.6, 0.85, lowNoise)   * uCloudLow * 0.5;
        midCloud  = smoothstep(0.65, 0.88, midNoise)  * uCloudLow * 0.4;
        highCloud = smoothstep(0.7, 0.9,  highNoise)  * uCloudHigh * 0.35;
    }

    // combine layers with slight height weighting
    float cloudCombined = clamp(
        lowCloud * 0.55 +
        midCloud * 0.3  +
        highCloud * 0.25,
        0.0, 1.0
    );

    // ----------------------------------------------------
    // Cloud color: weather base * time-of-day tint * lighting
    // ----------------------------------------------------

    vec3 baseCloudColor = weatherCloudBaseColor(uMode);
    vec3 todTint        = timeOfDayTint(uDayPhase, uMode);

    // approximate lighting term (PBR-ish)
    float lightTerm = cloudLighting(vUv, uDayPhase, cloudCombined);
    float ambient   = 0.35 + 0.4 * uSunIntensity; // base ambient from sun

    float lit = clamp(ambient + lightTerm * 1.4, 0.0, 1.5);

    vec3 cloudColor = baseCloudColor * todTint * lit;

    // slightly clamp for storms so they don't blow out
    if (uMode == 3) {
        cloudColor = mix(cloudColor, vec3(0.35, 0.37, 0.4), 0.25);
    }

    col = mix(col, cloudColor, cloudCombined * 0.9);

    // sun (driven by dayPhase)
    col = addSun(col, vUv, uDayPhase, uMode, uSunIntensity);

    // rain
    if (uMode == 2) {
        float r = rain(vUv * vec2(1.0, 1.6), t, uWind);
        col = mix(col, vec3(0.7, 0.75, 0.8), r * 0.5);
    }

    // lightning
    if (uMode == 3) {
        float flash = lightningFlash(t, uLightning);
        col += vec3(0.9, 0.95, 1.0) * flash;
    }

    // stars
    if (uMode == 5) {
        float s = stars(vUv, t);
        col += vec3(1.0, 0.98, 0.9) * s * 0.8;
    }

    // fog near horizon
    float fog = uFogDensity * smoothstep(0.0, 0.4, 1.0 - vUv.y);
    col = mix(col, vec3(0.7, 0.75, 0.8), fog);

    // subtle global warm tint at sunrise/sunset
    float warm = smoothstep(0.0, 0.15, uDayPhase) +
                 smoothstep(1.0, 0.85, uDayPhase);
    warm = clamp(warm, 0.0, 1.0);
    vec3 tint = mix(vec3(1.0), vec3(1.05, 0.9, 0.8), warm);
    col *= tint;

    // tiny aspect‑based lift
    col += vec3(aspect * 0.0008);

    gl_FragColor = vec4(col, 1.0);
}
