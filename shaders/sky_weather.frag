#ifdef GL_ES
precision mediump float;
#endif

uniform float uTime;
uniform vec2  uResolution;
uniform float uWeather;
uniform float uDayPhase;

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
    v += noise(p * 1.0) * 0.50;
    v += noise(p * 2.0) * 0.25;
    v += noise(p * 4.0) * 0.125;
    v += noise(p * 8.0) * 0.0625;
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

    float dayAmt = smoothstep(0.22, 0.50, uDayPhase) *
                   (1.0 - smoothstep(0.50, 0.78, uDayPhase));
    float nightAmt = 1.0 - dayAmt;

    // ------------------------------
    // Sky gradient
    // ------------------------------
    vec3 dayTop    = vec3(0.03, 0.20, 0.70);
    vec3 dayHorizon= vec3(0.70, 0.80, 0.98);

    vec3 nightTop  = vec3(0.02, 0.03, 0.08);
    vec3 nightHor  = vec3(0.08, 0.06, 0.12);

    float v = clamp(uv.y * 0.55 + 0.5, 0.0, 1.0);

    vec3 daySky   = mix(dayHorizon, dayTop, v);
    vec3 nightSky = mix(nightHor,   nightTop, v);

    vec3 col = mix(nightSky, daySky, dayAmt);

    // ------------------------------
    // Sun (radial, not wedge)
    // ------------------------------
    vec2 sd = sunDir(uDayPhase);

    // radial direction
    vec2 dir = normalize(vec2(uv.x, uv.y));
    float sunDot = dot(dir, sd);

    // radial distance for circular halo
    float r = length(dir - sd);

    float sunHalo = pow(max(1.0 - r, 0.0), 6.0);
    float sunCore = pow(max(1.0 - r, 0.0), 20.0);

    vec3 sunColor = vec3(1.0, 0.95, 0.85);

    col += sunColor * sunHalo * 1.2 * dayAmt;
    col += sunColor * sunCore * 2.0 * dayAmt;

    // ------------------------------
    // Moon
    // ------------------------------
    vec2 md = -sd;
    float moonR = length(dir - md);
    float moonGlow = pow(max(1.0 - moonR, 0.0), 12.0);

    vec3 moonColor = vec3(0.85, 0.88, 1.0);
    col += moonColor * moonGlow * nightAmt;

    // ------------------------------
    // Stars
    // ------------------------------
    float starMask = nightAmt * smoothstep(0.0, 0.4, uv.y + 0.2);
    float stars = 0.0;

    vec2 suv = uv * 2.5 + uTime * 0.01;

    vec2 g0 = floor(suv * 80.0);
    vec2 f0 = fract(suv * 80.0);
    float h0 = hash(g0);
    float s0 = smoothstep(0.0, 0.2, 0.2 - length(f0 - 0.5));
    stars += s0 * step(0.996, h0);

    vec2 g1 = floor((suv + 1.3) * 80.0);
    vec2 f1 = fract((suv + 1.3) * 80.0);
    float h1 = hash(g1);
    float s1 = smoothstep(0.0, 0.2, 0.2 - length(f1 - 0.5));
    stars += s1 * step(0.996, h1);

    col += vec3(stars) * starMask * 1.4;

    // ------------------------------
    // Clouds (more defined)
    // ------------------------------
    float cloudTime = uTime * 0.015;
    vec2 cuv = uv * vec2(0.9, 0.45) + vec2(cloudTime * 0.3, cloudTime * 0.1);

    float base = fbm(cuv * 1.2);
    float detail = fbm(cuv * 4.0);
    float erosion = fbm(cuv * 8.0);

    float cloud = base * 0.6 + detail * 0.3 - erosion * 0.2;

    float cloudShape = smoothstep(0.40, 0.80, cloud);

    float cloudDensity = mix(0.1, 1.0, uWeather);
    cloudShape = min(cloudShape * cloudDensity, 1.0);

    vec3 cloudLit = mix(vec3(1.0), vec3(0.7, 0.75, 0.82), uWeather);

    float cloudSun = pow(max(dot(dir, sd), 0.0), 3.0);
    cloudLit = mix(cloudLit, vec3(1.0, 0.95, 0.8), cloudSun * dayAmt * 0.7);

    col = mix(col, cloudLit, cloudShape * 0.92);

    // ------------------------------
    // Haze
    // ------------------------------
    col = mix(col, vec3(0.75, 0.78, 0.82),
              uWeather * 0.15 * (1.0 - uv.y * 0.5));

    // ------------------------------
    // Tonemap + gamma
    // ------------------------------
    col = col / (col + 0.15);
    col = pow(col, vec3(0.92));

    gl_FragColor = vec4(col, 1.0);
}
