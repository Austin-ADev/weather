#ifdef GL_ES
precision highp float;
#endif

uniform float uTime;
uniform vec2  uResolution;
uniform float uWeather;   // 0 = clear, 1 = partly cloudy, 2 = overcast

// ------------------------------------------------------------
// Noise helpers
// ------------------------------------------------------------
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
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

// ------------------------------------------------------------
// Starfield
// ------------------------------------------------------------
float starField(vec2 uv) {
    float s = noise(uv * 200.0);
    s = smoothstep(0.995, 1.0, s); // only brightest noise becomes stars
    return s;
}

// ------------------------------------------------------------
// Moon phase (simple disc for now)
// ------------------------------------------------------------
float moonDisc(vec2 p, vec2 moonPos, float radius) {
    float d = length(p - moonPos);
    return smoothstep(radius, radius * 0.92, d);
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;

    // aspect-corrected world coords
    vec2 p = gl_FragCoord.xy - 0.5 * uResolution.xy;
    float scale = min(uResolution.x, uResolution.y);
    p /= scale;

    // --------------------------------------------------------
    // NIGHT SKY COLORS
    // --------------------------------------------------------
    vec3 horizon = vec3(0.05, 0.07, 0.12); // faint city glow
    vec3 midSky  = vec3(0.03, 0.05, 0.10);
    vec3 zenith  = vec3(0.01, 0.015, 0.04);

    float h = clamp(uv.y, 0.0, 1.0);

    vec3 skyColor = mix(horizon, midSky, smoothstep(0.0, 0.4, h));
    skyColor = mix(skyColor, zenith, smoothstep(0.4, 1.0, h));

    // --------------------------------------------------------
    // STARFIELD
    // --------------------------------------------------------
    float starMask = starField(uv);
    vec3 starColor = vec3(1.0, 1.0, 1.0) * starMask * 1.2;

    // twinkle
    starColor *= 0.8 + 0.2 * sin(uTime * 3.0 + hash(uv) * 20.0);

    skyColor += starColor;

    // --------------------------------------------------------
    // MILKY WAY (subtle)
    // --------------------------------------------------------
    float mw = fbm(uv * 4.0 + vec2(0.0, uTime * 0.005));
    mw = smoothstep(0.55, 0.75, mw);
    skyColor += vec3(0.15, 0.12, 0.25) * mw * 0.4;

    // --------------------------------------------------------
    // MOON
    // --------------------------------------------------------
    vec2 moonPos = vec2(0.25, 0.35); // high in sky
    float moonRadius = 0.09;

    float mDisc = moonDisc(p, moonPos, moonRadius);
    vec3 moonColor = vec3(1.0, 0.98, 0.92);

    skyColor += moonColor * mDisc * 1.8;

    // moon bloom
    float d = length(p - moonPos);
    float bloom = exp(-d * 10.0);
    skyColor += moonColor * bloom * 1.2;

    // moon corona
    float corona = exp(-d * 4.0);
    skyColor += vec3(1.0, 0.95, 0.90) * corona * 0.4;

    // --------------------------------------------------------
    // CLOUD LAYER — airplane altitude
    // --------------------------------------------------------
    float cloudBandCenter = 0.55;
    float cloudBandHeight = 0.35;

    float bandMask = smoothstep(cloudBandCenter - cloudBandHeight,
                                cloudBandCenter,
                                uv.y) *
                     (1.0 - smoothstep(cloudBandCenter,
                                       cloudBandCenter + cloudBandHeight,
                                       uv.y));

    vec2 cloudUV = p * 3.0;
    cloudUV.x += uTime * 0.02;
    cloudUV.y += sin(uTime * 0.1) * 0.05;

    float baseCloud = fbm(cloudUV);
    float detailCloud = fbm(cloudUV * 2.5);
    float cloudField = baseCloud * 0.7 + detailCloud * 0.3;

    float cloudMask = smoothstep(0.55, 0.8, cloudField);

    float cloudAmount = mix(0.10, 0.85, clamp(uWeather, 0.0, 1.0));
    cloudMask *= cloudAmount;

    // night cloud color (moonlit)
    vec3 cloudColor = vec3(0.25, 0.28, 0.32);

    // moonlight on clouds
    float moonInfluence = exp(-d * 3.0);
    cloudColor += moonColor * moonInfluence * 0.3;

    float finalCloudMask = cloudMask * bandMask;

    skyColor = mix(skyColor, cloudColor, finalCloudMask * 0.9);

    // --------------------------------------------------------
    // DITHER
    // --------------------------------------------------------
    skyColor += hash(gl_FragCoord.xy) * 0.004;

    gl_FragColor = vec4(skyColor, 1.0);
}
