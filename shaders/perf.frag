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
uniform float uFogDensity;
uniform vec2  uWind;
uniform float uDayPhase;

// --------------------------------------------------------
// 2D hash / noise / fbm
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
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
    }
    return v;
}

// --------------------------------------------------------
// Sky base color
// --------------------------------------------------------

vec3 skyColor(float h, int mode) {
    if (mode == 5) {
        return mix(vec3(0.02, 0.03, 0.08), vec3(0.01, 0.02, 0.05), h);
    }
    if (mode == 3) {
        return mix(vec3(0.15, 0.16, 0.2), vec3(0.05, 0.05, 0.08), h);
    }
    if (mode == 2) {
        return mix(vec3(0.35, 0.4, 0.5), vec3(0.1, 0.1, 0.15), h);
    }
    if (mode == 4) {
        return mix(vec3(0.85, 0.9, 1.0), vec3(0.6, 0.7, 0.9), h);
    }
    if (mode == 1) {
        return mix(vec3(0.6, 0.75, 1.0), vec3(0.3, 0.4, 0.7), h);
    }
    return mix(vec3(0.55, 0.75, 1.0), vec3(0.2, 0.35, 0.7), h);
}

// --------------------------------------------------------
// Time-of-day & weather tints for clouds
// --------------------------------------------------------

vec3 timeOfDayTint(float dayPhase, int mode) {
    float sunrise = smoothstep(0.0, 0.15, dayPhase);
    float sunset  = smoothstep(1.0, 0.85, dayPhase);
    float night   = step(dayPhase, 0.05) + step(0.95, dayPhase);

    vec3 sunriseTint = vec3(1.25, 0.7, 0.6);
    vec3 sunsetTint  = vec3(1.3, 0.75, 0.65);
    vec3 nightTint   = vec3(0.6, 0.7, 1.0);
    vec3 dayTint     = vec3(1.0);

    vec3 tint = dayTint;
    tint = mix(tint, sunriseTint, sunrise);
    tint = mix(tint, sunsetTint,  sunset);
    tint = mix(tint, nightTint,   clamp(night, 0.0, 1.0));

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
    return vec3(1.0);
}

// fake lighting from screen-space normal
float cloudLighting2D(vec2 uv, float dayPhase, float density) {
    float angle = dayPhase * 6.2831853;
    vec3 sunDir = normalize(vec3(cos(angle), sin(angle), 0.4));

    vec3 n = normalize(vec3(uv.x, uv.y + 0.4, 0.6));
    float ndotl = clamp(dot(n, sunDir), 0.0, 1.0);

    float scatter = pow(ndotl, mix(1.0, 3.0, density));
    return scatter;
}

// --------------------------------------------------------
// Sun (simple 2D)
// --------------------------------------------------------

vec3 addSun(vec3 col, vec2 uv, float dayPhase, int mode, float sunIntensity) {
    if (mode == 5) return col;

    float angle = dayPhase * 6.2831853;
    vec2 sunPos = vec2(
        0.5 + cos(angle) * 0.45,
        0.2 + sin(angle) * 0.35
    );

    float d = distance(uv, sunPos);
    float core  = smoothstep(0.06, 0.02, d);
    float halo  = smoothstep(0.28, 0.06, d);

    vec3 sunColor = vec3(1.0, 0.96, 0.88) * sunIntensity;

    col += sunColor * core * 2.0;
    col += sunColor * halo * 0.5;

    return col;
}

// --------------------------------------------------------
// Main
// --------------------------------------------------------

void main() {
    if (uResolution.x <= 0.0 || uResolution.y <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float h = vUv.y;
    vec3 col = skyColor(h, uMode);

    vec2 uv = vUv;

    // move clouds with time + wind
    vec2 wind2 = uWind * (0.15 + 0.25 * uCloudSpeed);
    vec2 baseUV = uv + wind2 * uTime * 0.05;

    float q = float(uQuality);
    float scaleLow  = 2.5 + q * 0.6;
    float scaleHigh = 5.0 + q * 0.8;

    float low  = fbm(baseUV * scaleLow  + vec2(uSeed, uSeed * 1.3));
    float high = fbm(baseUV * scaleHigh + vec2(uSeed * 1.7, uSeed * 2.1));

    float lowLayer  = smoothstep(0.45, 0.7, low)  * uCloudLow;
    float highLayer = smoothstep(0.55, 0.8, high) * uCloudHigh;

    float height = h;
    float density = lowLayer * (1.0 - height) + highLayer * height;
    density = clamp(density * 1.2, 0.0, 1.2);

    vec3 baseCloud = weatherCloudBaseColor(uMode);
    vec3 todTint   = timeOfDayTint(uDayPhase, uMode);

    float lightTerm = cloudLighting2D(uv * 2.0 - 1.0, uDayPhase, density);
    float ambient   = 0.35 + 0.4 * uSunIntensity;
    float lit       = clamp(ambient + lightTerm * 1.3, 0.0, 1.4);

    vec3 cloudColor = baseCloud * todTint * lit;

    if (uMode == 3) {
        cloudColor = mix(cloudColor, vec3(0.35, 0.37, 0.4), 0.25);
    }

    col = mix(col, cloudColor, clamp(density, 0.0, 1.0));

    // sun
    col = addSun(col, vUv, uDayPhase, uMode, uSunIntensity);

    // fog near horizon
    float fog = uFogDensity * smoothstep(0.0, 0.4, 1.0 - vUv.y);
    col = mix(col, vec3(0.7, 0.75, 0.8), fog);

    // warm tint at sunrise/sunset
    float warm = smoothstep(0.0, 0.15, uDayPhase) +
                 smoothstep(1.0, 0.85, uDayPhase);
    warm = clamp(warm, 0.0, 1.0);
    vec3 tint = mix(vec3(1.0), vec3(1.05, 0.9, 0.8), warm);
    col *= tint;

    gl_FragColor = vec4(col, 1.0);
}
