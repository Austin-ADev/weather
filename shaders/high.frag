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

    // cloud drift (wind‑aware)
    vec2 driftLow = vec2(
        sin(t * 0.05 * uCloudSpeed + seed) * 0.15 + uWind.x * 0.2,
        cos(t * 0.03 * uCloudSpeed + seed * 1.3) * 0.08 + uWind.y * 0.1
    );
    vec2 driftHigh = vec2(
        sin(t * 0.02 * uCloudSpeed + seed * 0.7) * 0.1 + uWind.x * 0.1,
        cos(t * 0.015 * uCloudSpeed + seed * 1.9) * 0.06 + uWind.y * 0.05
    );

    // slight refraction for clouds
    vec2 baseUV = vUv;
    float refractStrength = 0.0015 + float(uQuality) * 0.0007;
    vec2 refractUV = baseUV + vec2(
        noise(baseUV * 6.0 + t * 0.2 + seed),
        noise(baseUV * 6.0 - t * 0.17 + seed * 1.3)
    ) * refractStrength;

    // cloud fields
    float low  = fbm(refractUV * (3.0 + float(uQuality)) + driftLow + seed);
    float high = fbm(refractUV * (8.0 + float(uQuality)) + driftHigh + seed * 1.7);

    float lowCloud  = 0.0;
    float highCloud = 0.0;

    if (uMode == 0) {
        // clear
        lowCloud  = smoothstep(0.7, 0.9, low) * 0.2;
        highCloud = smoothstep(0.8, 0.95, high) * 0.15;
    } else if (uMode == 1) {
        // partly / cloudy
        lowCloud  = smoothstep(0.45, 0.75, low) * uCloudLow;
        highCloud = smoothstep(0.55, 0.85, high) * uCloudHigh * 0.7;
    } else if (uMode == 2) {
        // rain
        lowCloud  = smoothstep(0.35, 0.65, low) * uCloudLow * 1.2;
        highCloud = smoothstep(0.5, 0.8, high) * uCloudHigh * 0.5;
    } else if (uMode == 3) {
        // storm
        lowCloud  = smoothstep(0.3, 0.6, low) * uCloudLow * 1.5;
        highCloud = smoothstep(0.45, 0.75, high) * uCloudHigh * 0.8;
    } else if (uMode == 4) {
        // snow
        lowCloud  = smoothstep(0.4, 0.7, low) * uCloudLow;
        highCloud = smoothstep(0.55, 0.85, high) * uCloudHigh;
    } else if (uMode == 5) {
        // night
        lowCloud  = smoothstep(0.55, 0.85, low) * uCloudLow * 0.4;
        highCloud = smoothstep(0.65, 0.9, high) * uCloudHigh * 0.3;
    }

    float cloudCombined = clamp(lowCloud + highCloud, 0.0, 1.0);

    vec3 cloudColor = vec3(1.0);
    if (uMode == 2 || uMode == 3) cloudColor = vec3(0.8, 0.82, 0.85);
    if (uMode == 5) cloudColor = vec3(0.6, 0.65, 0.7);

    col = mix(col, cloudColor, cloudCombined * 0.85);

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

    // subtle dayPhase warm tint at sunrise/sunset
    float warm = smoothstep(0.0, 0.15, uDayPhase) +
                 smoothstep(1.0, 0.85, uDayPhase);
    warm = clamp(warm, 0.0, 1.0);
    vec3 tint = mix(vec3(1.0), vec3(1.05, 0.9, 0.8), warm);
    col *= tint;

    // tiny aspect‑based lift
    col += vec3(aspect * 0.0008);

    gl_FragColor = vec4(col, 1.0);
}
