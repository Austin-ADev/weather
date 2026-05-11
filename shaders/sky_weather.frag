#ifdef GL_ES
precision mediump float;
#endif

uniform float uTime;
uniform vec2  uResolution;
uniform float uWeather;   // 0.0 = clear, 1.0 = overcast
uniform float uDayPhase;  // 0.0 = midnight, 0.5 = noon, 1.0 = next midnight

// Hash
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Simple noise
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

    // Day/night blend
    float dayAmt = smoothstep(0.22, 0.50, uDayPhase) *
                   (1.0 - smoothstep(0.50, 0.78, uDayPhase));
    float nightAmt = 1.0 - dayAmt;

    // Base sky colors
    vec3 dayTop    = vec3(0.18, 0.45, 0.95);
    vec3 dayHorizon= vec3(0.85, 0.70, 0.55);

    vec3 nightTop  = vec3(0.02, 0.03, 0.08);
    vec3 nightHor  = vec3(0.08, 0.06, 0.12);

    float v = clamp(uv.y * 0.5 + 0.5, 0.0, 1.0);

    vec3 daySky   = mix(dayHorizon, dayTop, v);
    vec3 nightSky = mix(nightHor,   nightTop, v);

    vec3 col = mix(nightSky, daySky, dayAmt);

    // SUN
    vec2 sd = sunDir(uDayPhase);
    float sunDot = dot(normalize(vec2(uv.x, uv.y)), sd);

    float sunGlow = smoothstep(0.995, 1.0, sunDot);
    float sunCore = smoothstep(0.9995, 1.0, sunDot);

    vec3 sunColor = vec3(1.0, 0.92, 0.75);

    col += sunColor * sunGlow * 0.7 * dayAmt;
    col += sunColor * sunCore * 1.5 * dayAmt;

    // MOON (opposite sun)
    vec2 md = -sd;
    float moonDot = dot(normalize(vec2(uv.x, uv.y)), md);
    float moonCore = smoothstep(0.9995, 1.0, moonDot);

    vec3 moonColor = vec3(0.85, 0.88, 1.0);
    col += moonColor * moonCore * 0.8 * nightAmt;
    // STARS
    float starMask = nightAmt * smoothstep(0.0, 0.4, uv.y + 0.2);
    float stars = 0.0;

    if (starMask > 0.0) {
        vec2 suv = uv * 1.5 + uTime * 0.01;
        vec2 g = floor(suv * 80.0);
        vec2 f = fract(suv * 80.0);
        float h = hash(g);
        float s = smoothstep(0.0, 0.2, 0.2 - length(f - 0.5));
        stars = s * step(0.995, h);
    }

    col += vec3(stars) * starMask * 1.2;

    // CLOUDS
    float cloudNoise = 0.0;
    vec2 cuv = uv * 0.7 + vec2(uTime * 0.01, 0.0);

    float amp = 0.5;
    float freq = 1.0;

    for (int i = 0; i < 4; i++) {
        cloudNoise += noise(cuv * freq) * amp;
        freq *= 2.0;
        amp *= 0.5;
    }

    float clouds = smoothstep(0.4, 0.8, cloudNoise);

    float cloudAmount = mix(0.1, 1.0, uWeather);
    vec3 cloudColor = mix(vec3(1.0), vec3(0.75, 0.78, 0.82), uWeather);

    col = mix(col, cloudColor, clouds * cloudAmount * 0.8);

    // Gamma
    col = pow(col, vec3(0.92));

    gl_FragColor = vec4(col, 1.0);
}
