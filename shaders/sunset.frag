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
// Phase functions
// ------------------------------------------------------------
float rayleighPhase(float cosTheta) {
    return 3.0 / (16.0 * 3.14159) * (1.0 + cosTheta * cosTheta);
}

float hgPhase(float cosTheta, float g) {
    float g2 = g * g;
    return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
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
    // SUN POSITION — low on horizon, right side
    // --------------------------------------------------------
    vec2 sunPos = vec2(0.38, 0.05);

    float dist = length(p - sunPos);

    // --------------------------------------------------------
    // SKY COLORS — sunset palette
    // --------------------------------------------------------
    vec3 horizon = vec3(1.0, 0.45, 0.30);  // deep orange/red
    vec3 midSky  = vec3(0.95, 0.60, 0.75); // rose-magenta
    vec3 zenith  = vec3(0.15, 0.10, 0.30); // purple-blue

    float h = clamp(uv.y, 0.0, 1.0);

    vec3 skyColor = mix(horizon, midSky, smoothstep(0.0, 0.4, h));
    skyColor = mix(skyColor, zenith, smoothstep(0.4, 1.0, h));

    // horizon fog glow
    float fog = exp(-abs(uv.y - 0.0) * 8.0);
    skyColor = mix(skyColor, vec3(1.0, 0.75, 0.65), fog * 0.35);

    // --------------------------------------------------------
    // SUN DISC + BLOOM
    // --------------------------------------------------------
    float sunRadius = 0.085;
    float disc = smoothstep(sunRadius, sunRadius * 0.92, dist);

    vec3 sunColor = vec3(1.0, 0.60, 0.30); // fiery orange

    skyColor += sunColor * disc * 2.0;

    float bloom = exp(-dist * 10.0);
    skyColor += sunColor * bloom * 1.4;

    float corona = exp(-dist * 4.0);
    skyColor += vec3(1.0, 0.90, 0.80) * corona * 0.5;

    // --------------------------------------------------------
    // SCATTERING
    // --------------------------------------------------------
    vec2 dir = normalize(p);
    vec2 sunDir = normalize(sunPos);
    float cosTheta = dot(dir, sunDir);

    float ray = rayleighPhase(cosTheta) * 0.6;
    float mie = hgPhase(cosTheta, 0.85) * 0.35;

    skyColor += vec3(0.45, 0.65, 1.0) * ray;
    skyColor += sunColor * mie * 0.8;

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
    cloudUV.x += uTime * 0.03;
    cloudUV.y += sin(uTime * 0.1) * 0.05;

    float baseCloud = fbm(cloudUV);
    float detailCloud = fbm(cloudUV * 2.5);
    float cloudField = baseCloud * 0.7 + detailCloud * 0.3;

    float cloudMask = smoothstep(0.55, 0.8, cloudField);

    float cloudAmount = mix(0.15, 0.85, clamp(uWeather, 0.0, 1.0));
    cloudMask *= cloudAmount;

    vec3 cloudColor = vec3(1.0, 0.60, 0.70); // warm magenta-orange clouds

    float sunInfluence = exp(-dist * 3.0);
    cloudColor += sunColor * sunInfluence * 0.4;

    float finalCloudMask = cloudMask * bandMask;

    skyColor = mix(skyColor, cloudColor, finalCloudMask * 0.9);

    // --------------------------------------------------------
    // DITHER
    // --------------------------------------------------------
    skyColor += hash(gl_FragCoord.xy) * 0.004;

    gl_FragColor = vec4(skyColor, 1.0);
}
