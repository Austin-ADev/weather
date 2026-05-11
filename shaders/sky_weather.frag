#ifdef GL_ES
precision mediump float;
#endif

uniform float uTime;
uniform vec2  uResolution;
uniform float uWeather;   // 0.0 = clear, 1.0 = overcast
uniform float uDayPhase;  // 0.0 = midnight, 0.5 = noon, 1.0 = next midnight

// ------------------------------
// Utility
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

// Sun direction from day phase
vec2 sunDir(float phase) {
    float a = (phase - 0.25) * 6.2831853; // shift so 0.5 = top
    return normalize(vec2(cos(a), sin(a)));
}

void main() {
    vec2 uv = (gl_FragCoord.xy / uResolution.xy) * 2.0 - 1.0;
    uv.x *= uResolution.x / uResolution.y;

    // ------------------------------
    // Day / Night blend
    // ------------------------------
    float dayAmt = smoothstep(0.22, 0.50, uDayPhase) *
                   (1.0 - smoothstep(0.50, 0.78, uDayPhase));
    float nightAmt = 1.0 - dayAmt;

    // ------------------------------
    // Deep Blue Midday Sky Colors
    // ------------------------------
    vec3 dayTop    = vec3(0.05, 0.25, 0.75);   // deep zenith blue
    vec3 dayHorizon= vec3(0.65, 0.75, 0.95);   // bright horizon

    vec3 nightTop  = vec3(0.02, 0.03, 0.08);
    vec3 nightHor  = vec3(0.08, 0.06, 0.12);

    float v = clamp(uv.y * 0.55 + 0.5, 0.0, 1.0);

    vec3 daySky   = mix(dayHorizon, dayTop, v);
    vec3 nightSky = mix(nightHor,   nightTop, v);

    vec3 col = mix(nightSky, daySky, dayAmt);

    // ------------------------------
    // Sun (tight Mie halo)
    // ------------------------------
    vec2 sd = sunDir(uDayPhase);
    float sunDot = dot(normalize(vec2(uv.x, uv.y)), sd);

    float sunHalo = pow(max(sunDot, 0.0), 200.0);   // tight halo
    float sunCore = pow(max(sunDot, 0.0), 800.0);   // bright core

    vec3 sunColor = vec3(1.0, 0.95, 0.85);

    col += sunColor * sunHalo * 1.2 * dayAmt;
    col += sunColor * sunCore * 2.0 * dayAmt;

    // ------------------------------
    // Moon (opposite sun)
    // ------------------------------
    vec2 md = -sd;
    float moonDot = dot(normalize(vec2(uv.x, uv.y)), md);
    float moonGlow = pow(max(moonDot, 0.0), 600.0);

    vec3 moonColor = vec3(0.85, 0.88, 1.0);
    col += moonColor * moonGlow * nightAmt;
    // ------------------------------
    // Stars (fade in at night)
    // ------------------------------
    float starMask = nightAmt * smoothstep(0.0, 0.4, uv.y + 0.2);
    float stars = 0.0;

    if (starMask > 0.0) {
        vec2 suv = uv * 1.8 + uTime * 0.01;
        vec2 g = floor(suv * 90.0);
        vec2 f = fract(suv * 90.0);
        float h = hash(g);
        float s = smoothstep(0.0, 0.2, 0.2 - length(f - 0.5));
        stars = s * step(0.996, h);
    }

    col += vec3(stars) * starMask * 1.4;

    // ------------------------------
    // Clouds (weather‑driven)
    // ------------------------------
    float cloudNoise = 0.0;
    vec2 cuv = uv * 0.65 + vec2(uTime * 0.01, 0.0);

    float amp = 0.55;
    float freq = 1.0;

    for (int i = 0; i < 5; i++) {
        cloudNoise += noise(cuv * freq) * amp;
        freq *= 2.0;
        amp *= 0.5;
    }

    float clouds = smoothstep(0.45, 0.85, cloudNoise);

    float cloudAmount = mix(0.05, 1.0, uWeather);
    vec3 cloudColor = mix(vec3(1.0), vec3(0.78, 0.80, 0.85), uWeather);

    col = mix(col, cloudColor, clouds * cloudAmount * 0.85);

    // ------------------------------
    // Final gamma
    // ------------------------------
    col = pow(col, vec3(0.92));

    gl_FragColor = vec4(col, 1.0);
}
