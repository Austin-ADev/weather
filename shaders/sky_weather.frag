#ifdef GL_ES
precision mediump float;
#endif

uniform float uTime;
uniform vec2  uResolution;
uniform float uWeather;   // 0.0 clear, 1.0 overcast / stormy
uniform float uDayPhase;  // 0.0 midnight, 0.5 noon, 1.0 next midnight

// ------------------------------
// Hash + Noise
// ------------------------------
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f*f*(3.0 - 2.0*f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// ------------------------------
// FBM (unrolled, WebGL1‑safe)
// ------------------------------
float fbm(vec2 p) {
    float v = 0.0;
    v += noise(p * 1.0)  * 0.50;
    v += noise(p * 2.0)  * 0.25;
    v += noise(p * 4.0)  * 0.125;
    v += noise(p * 8.0)  * 0.0625;
    v += noise(p * 16.0) * 0.03125;
    return v;
}

// ------------------------------
// Utility: smooth day curve
// ------------------------------
float dayCurve(float p) {
    float d = abs(p - 0.5) * 2.0;   // 0 at noon, 1 at midnight
    d = 1.0 - d;                    // 1 at noon, 0 at midnight
    return clamp(d, 0.0, 1.0);
}

// ------------------------------
// Sun direction (simple orbit)
// ------------------------------
vec2 sunDir(float phase) {
    float a = (phase - 0.25) * 6.2831853;
    return normalize(vec2(cos(a), sin(a)));
}

// ------------------------------
// Time-of-day color helpers
// ------------------------------
vec3 daySkyColor(float v) {
    // Slightly deeper zenith, softer horizon
    vec3 zenith  = vec3(0.04, 0.28, 0.82);
    vec3 horizon = vec3(0.72, 0.84, 1.05);
    return mix(horizon, zenith, v);
}

vec3 nightSkyColor(float v) {
    vec3 zenith  = vec3(0.01, 0.02, 0.06);
    vec3 horizon = vec3(0.03, 0.02, 0.07);
    return mix(horizon, zenith, v);
}

// Warm sunrise/sunset tint
vec3 twilightTint(float phase) {
    float edge = min(phase, 1.0 - phase);
    float t = smoothstep(0.0, 0.18, edge) * (1.0 - smoothstep(0.18, 0.35, edge));
    vec3 warm = vec3(1.0, 0.58, 0.30);
    return warm * t;
}

// ------------------------------
// Main
// ------------------------------
void main() {
    vec2 uv = (gl_FragCoord.xy / uResolution.xy) * 2.0 - 1.0;
    uv.x *= uResolution.x / uResolution.y;

    // ------------------------------
    // Day/night amounts
    // ------------------------------
    float dayAmtRaw = dayCurve(uDayPhase);
    float dayAmt    = smoothstep(0.05, 0.95, dayAmtRaw);
    float nightAmt  = 1.0 - dayAmt;

    // ------------------------------
    // Base sky gradient
    // ------------------------------
    float v = clamp(uv.y * 0.55 + 0.5, 0.0, 1.0);

    vec3 daySky   = daySkyColor(v);
    vec3 nightSky = nightSkyColor(v);

    // Add twilight warmth to day sky near sunrise/sunset
    vec3 tw = twilightTint(uDayPhase);
    daySky = mix(daySky, daySky + tw, 0.55);

    vec3 col = mix(nightSky, daySky, dayAmt);

    // Slight darkening with weather (overcast = darker sky)
    float skyDark = mix(1.0, 0.58, clamp(uWeather, 0.0, 1.0));
    col *= skyDark;

    // ------------------------------
    // Sun
    // ------------------------------
    vec2 sd = sunDir(uDayPhase);
    vec2 sunPos = sd * 0.78;
    float sunDist = length(uv - sunPos);

    float sunHalo = pow(max(1.0 - sunDist, 0.0), 4.0);
    float sunCore = pow(max(1.0 - sunDist, 0.0), 18.0);

    float sunWeather = mix(1.0, 0.28, clamp(uWeather, 0.0, 1.0));

    vec3 sunColor = vec3(1.0, 0.96, 0.88);
    col += sunColor * sunHalo * 1.3 * dayAmt * sunWeather;
    col += sunColor * sunCore * 2.4 * dayAmt * sunWeather;

    // Warm horizon glow near sun, stronger at low sun angles
    float sunHeight = sd.y * 0.5 + 0.5;
    float lowSun = 1.0 - smoothstep(0.32, 0.82, sunHeight);
    float horizonGlow = exp(-abs(uv.y) * 6.0) * dayAmt * lowSun;
    vec3 horizonWarm = vec3(1.0, 0.76, 0.48);
    col += horizonWarm * horizonGlow * 0.38 * (1.0 - uWeather * 0.6);

    // ------------------------------
    // Moon
    // ------------------------------
    vec2 md = -sd;
    vec2 moonPos = md * 0.78;
    float moonDist = length(uv - moonPos);

    float moonBody = smoothstep(0.20, 0.18, moonDist);
    float moonGlow = pow(max(1.0 - moonDist, 0.0), 6.0);

    float moonTex = fbm((uv - moonPos) * 11.0);
    vec3 moonBase = vec3(0.90, 0.93, 1.0) * (0.86 + 0.14 * moonTex);

    float moonWeather = mix(1.0, 0.65, clamp(uWeather, 0.0, 1.0));

    col += moonBase * moonBody * nightAmt * 1.25 * moonWeather;
    col += vec3(0.8, 0.85, 1.0) * moonGlow * nightAmt * 0.85 * moonWeather;

    // ------------------------------
    // Stars
    // ------------------------------
    float starMask = nightAmt * smoothstep(0.0, 0.4, uv.y + 0.2);
    float stars = 0.0;

    vec2 suv = uv * 3.0 + uTime * 0.01;

    vec2 g0 = floor(suv * 90.0);
    vec2 f0 = fract(suv * 90.0);
    float h0 = hash(g0);
    float s0 = smoothstep(0.0, 0.18, 0.18 - length(f0 - 0.5));
    stars += s0 * step(0.995, h0);

    vec2 g1 = floor((suv + 1.37) * 90.0);
    vec2 f1 = fract((suv + 1.37) * 90.0);
    float h1 = hash(g1);
    float s1 = smoothstep(0.0, 0.18, 0.18 - length(f1 - 0.5));
    stars += s1 * step(0.996, h1);

    vec2 g2 = floor((suv + 2.71) * 90.0);
    vec2 f2 = fract((suv + 2.71) * 90.0);
    float h2 = hash(g2);
    float s2 = smoothstep(0.0, 0.18, 0.18 - length(f2 - 0.5));
    stars += s2 * step(0.997, h2);

    float starWeather = mix(1.0, 0.28, clamp(uWeather, 0.0, 1.0));
    col += vec3(stars) * starMask * 1.55 * starWeather;

    // ------------------------------
    // Clouds (weather‑driven)
// ------------------------------
    float cloudTime = uTime * 0.015;
    vec2 cuv = uv * vec2(0.9, 0.45) + vec2(cloudTime * 0.3, cloudTime * 0.1);

    float base    = fbm(cuv * 1.2);
    float detail  = fbm(cuv * 3.0);
    float erosion = fbm(cuv * 6.0);

    float cloud = base * 0.6 + detail * 0.35 - erosion * 0.25;
    float cloudShape = smoothstep(0.44, 0.80, cloud);

    float cloudCoverage = mix(0.06, 1.0, clamp(uWeather, 0.0, 1.0));
    cloudShape = min(cloudShape * cloudCoverage, 1.0);

    vec3 dayCloudColor   = mix(vec3(1.0), vec3(0.76, 0.81, 0.87), uWeather);
    vec3 nightCloudColor = vec3(0.20, 0.23, 0.30);

    vec3 cloudLit = mix(nightCloudColor, dayCloudColor, dayAmt);

    vec2 dir = normalize(vec2(uv.x, max(uv.y, -0.2)));
    float cloudSun = pow(max(dot(dir, sd), 0.0), 3.0);
    cloudLit = mix(cloudLit, vec3(1.0, 0.95, 0.85),
                   cloudSun * dayAmt * 0.8 * (1.0 - uWeather * 0.5));

    float cloudMoon = pow(max(dot(dir, md), 0.0), 4.0);
    cloudLit += vec3(0.7, 0.8, 1.0) * cloudMoon * nightAmt * 0.4;

    float storm = smoothstep(0.7, 1.0, uWeather);
    vec3 stormTint = vec3(0.25, 0.28, 0.34);
    cloudLit = mix(cloudLit, stormTint, storm * 0.6);

    col = mix(col, cloudLit, cloudShape * 0.95);

    // Dim stars behind clouds
    col -= vec3(stars) * cloudShape * 0.6 * nightAmt;

    // ------------------------------
    // Haze / atmosphere (weather‑based)
// ------------------------------
    float horizonFactor = 1.0 - clamp((uv.y + 0.2) * 0.9, 0.0, 1.0);
    float haze = uWeather * 0.22 * horizonFactor;

    vec3 hazeColorDay   = vec3(0.78, 0.80, 0.84);
    vec3 hazeColorNight = vec3(0.10, 0.11, 0.16);
    vec3 hazeColor = mix(hazeColorNight, hazeColorDay, dayAmt);

    col = mix(col, hazeColor, haze);

    // ------------------------------
    // Tonemap + gamma
    // ------------------------------
    col = col / (col + 0.18);
    col = pow(col, vec3(0.92));

    gl_FragColor = vec4(col, 1.0);
}
