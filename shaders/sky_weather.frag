#ifdef GL_ES
precision mediump float;
#endif

uniform float uTime;
uniform vec2  uResolution;
uniform float uWeather;   // 0.0 clear, 1.0 overcast
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
// Sun direction
// ------------------------------
vec2 sunDir(float phase) {
    float a = (phase - 0.25) * 6.2831853;
    return normalize(vec2(cos(a), sin(a)));
}

void main() {
    vec2 uv = (gl_FragCoord.xy / uResolution.xy) * 2.0 - 1.0;
    uv.x *= uResolution.x / uResolution.y;

    // Day/night blend
    float dayAmt = smoothstep(0.22, 0.50, uDayPhase) *
                   (1.0 - smoothstep(0.50, 0.78, uDayPhase));
    float nightAmt = 1.0 - dayAmt;

    // ------------------------------
    // Base sky gradient
    // ------------------------------
    vec3 dayTop     = vec3(0.03, 0.20, 0.70);
    vec3 dayHorizon = vec3(0.70, 0.80, 0.98);

    vec3 nightTop   = vec3(0.01, 0.02, 0.06);
    vec3 nightHor   = vec3(0.03, 0.02, 0.07);

    float v = clamp(uv.y * 0.55 + 0.5, 0.0, 1.0);

    vec3 daySky   = mix(dayHorizon, dayTop, v);
    vec3 nightSky = mix(nightHor,   nightTop, v);

    vec3 col = mix(nightSky, daySky, dayAmt);

    // ------------------------------
    // Sun (circular halo in screen space)
// ------------------------------
    vec2 sd = sunDir(uDayPhase);

    // Map sun direction into screen-space position
    vec2 sunPos = sd * 0.75; // keep inside view
    float sunDist = length(uv - sunPos);

    float sunHalo = pow(max(1.0 - sunDist, 0.0), 4.0);
    float sunCore = pow(max(1.0 - sunDist, 0.0), 18.0);

    vec3 sunColor = vec3(1.0, 0.96, 0.88);

    col += sunColor * sunHalo * 1.2 * dayAmt;
    col += sunColor * sunCore * 2.0 * dayAmt;

    // Warm horizon glow near sun
    float horizonGlow = exp(-abs(uv.y) * 6.0) * dayAmt;
    col += vec3(1.0, 0.75, 0.45) * horizonGlow * 0.25;

    // ------------------------------
    // Moon (circular, with subtle texture)
// ------------------------------
    vec2 md = -sd;
    vec2 moonPos = md * 0.75;
    float moonDist = length(uv - moonPos);

    float moonBody = smoothstep(0.20, 0.18, moonDist); // soft disk
    float moonGlow = pow(max(1.0 - moonDist, 0.0), 6.0);

    // Simple moon texture
    float moonTex = fbm((uv - moonPos) * 12.0);
    vec3 moonBase = vec3(0.90, 0.93, 1.0) * (0.85 + 0.15 * moonTex);

    col += moonBase * moonBody * nightAmt * 1.2;
    col += vec3(0.8, 0.85, 1.0) * moonGlow * nightAmt * 0.8;

    // ------------------------------
    // Stars (denser, but masked by clouds later)
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

    col += vec3(stars) * starMask * 1.6;

    // ------------------------------
    // Clouds (day & night, more realistic)
// ------------------------------
    float cloudTime = uTime * 0.015;
    vec2 cuv = uv * vec2(0.9, 0.45) + vec2(cloudTime * 0.3, cloudTime * 0.1);

    float base    = fbm(cuv * 1.2);
    float detail  = fbm(cuv * 3.0);
    float erosion = fbm(cuv * 6.0);

    float cloud = base * 0.6 + detail * 0.35 - erosion * 0.25;

    float cloudShape = smoothstep(0.42, 0.82, cloud);

    float cloudDensity = mix(0.08, 1.0, uWeather);
    cloudShape = min(cloudShape * cloudDensity, 1.0);

    // Cloud lighting: day vs night
    vec3 dayCloudColor   = mix(vec3(1.0), vec3(0.75, 0.80, 0.86), uWeather);
    vec3 nightCloudColor = vec3(0.20, 0.23, 0.30);

    vec3 cloudLit = mix(nightCloudColor, dayCloudColor, dayAmt);

    // Sun lighting on clouds (day)
    vec2 dir = normalize(uv);
    float cloudSun = pow(max(dot(dir, sd), 0.0), 3.0);
    cloudLit = mix(cloudLit, vec3(1.0, 0.95, 0.85),
                   cloudSun * dayAmt * 0.8);

    // Moon lighting on clouds (night)
    float cloudMoon = pow(max(dot(dir, md), 0.0), 4.0);
    cloudLit += vec3(0.7, 0.8, 1.0) * cloudMoon * nightAmt * 0.4;

    // Apply clouds over sky
    col = mix(col, cloudLit, cloudShape * 0.95);

    // Dim stars behind clouds
    col -= vec3(stars) * cloudShape * 0.6 * nightAmt;

    // ------------------------------
    // Haze / atmosphere
    // ------------------------------
    float haze = uWeather * 0.18 * (1.0 - uv.y * 0.4);
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
