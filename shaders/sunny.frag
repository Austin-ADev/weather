#ifdef GL_ES
precision highp float;
#endif

uniform float uTime;          // seconds
uniform vec2  uResolution;    // viewport
uniform float uDayPhase;      // 0.0 = sunrise, 0.5 = noon, 1.0 = sunset
uniform float uWeather;       // 0 = clear, 1 = partly cloudy, 2 = overcast

// ------------------------------------------------------------
// Hash / noise helpers
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
// Phase helpers
// ------------------------------------------------------------
float smoothPulse(float x, float a, float b) {
    float t = clamp((x - a) / (b - a), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

// ------------------------------------------------------------
// Sun / sky color models
// ------------------------------------------------------------
vec3 sunColorForPhase(float phase) {
    // 0 = sunrise, 0.5 = noon, 1 = sunset
    vec3 sunrise = vec3(1.0, 0.55, 0.35);
    vec3 noon    = vec3(1.0, 0.95, 0.80);
    vec3 sunset  = vec3(1.0, 0.50, 0.30);

    if (phase < 0.5) {
        float t = phase / 0.5;
        return mix(sunrise, noon, t);
    } else {
        float t = (phase - 0.5) / 0.5;
        return mix(noon, sunset, t);
    }
}

vec3 skyZenithColor(float phase) {
    vec3 dawn   = vec3(0.10, 0.20, 0.45);
    vec3 noon   = vec3(0.15, 0.45, 1.00);
    vec3 dusk   = vec3(0.08, 0.15, 0.35);

    if (phase < 0.5) {
        float t = phase / 0.5;
        return mix(dawn, noon, t);
    } else {
        float t = (phase - 0.5) / 0.5;
        return mix(noon, dusk, t);
    }
}

vec3 skyHorizonColor(float phase) {
    vec3 dawn   = vec3(0.95, 0.60, 0.55);
    vec3 noon   = vec3(0.70, 0.85, 1.00);
    vec3 dusk   = vec3(0.95, 0.55, 0.50);

    if (phase < 0.5) {
        float t = phase / 0.5;
        return mix(dawn, noon, t);
    } else {
        float t = (phase - 0.5) / 0.5;
        return mix(noon, dusk, t);
    }
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
    // Sun position along horizon arc (airplane altitude)
    // --------------------------------------------------------
    float phase = clamp(uDayPhase, 0.0, 1.0);

    // sun moves left->right across horizon band
    float sunX = mix(-0.6, 0.6, phase);
    float sunY = 0.05; // near horizon from airplane POV

    vec2 sunPos = vec2(sunX, sunY);

    // --------------------------------------------------------
    // Base sky gradient
    // --------------------------------------------------------
    vec3 zenith = skyZenithColor(phase);
    vec3 horizon = skyHorizonColor(phase);

    float h = clamp(uv.y, 0.0, 1.0);
    vec3 skyColor = mix(horizon, zenith, pow(h, 1.2));

    // subtle horizon fog
    float fog = exp(-abs(uv.y - 0.0) * 8.0);
    skyColor = mix(skyColor, vec3(0.95, 0.95, 1.0), fog * 0.25);

    // --------------------------------------------------------
    // Sun disc + bloom
    // --------------------------------------------------------
    float dist = length(p - sunPos);

    float sunRadius = 0.08;
    float disc = smoothstep(sunRadius, sunRadius * 0.92, dist);
    vec3 sunCol = sunColorForPhase(phase);

    // direct disc
    skyColor += sunCol * disc * 2.0;

    // radial bloom
    float bloom = exp(-dist * 10.0);
    skyColor += sunCol * bloom * 1.2;

    // corona
    float corona = exp(-dist * 4.0);
    skyColor += vec3(1.0, 0.98, 0.9) * corona * 0.4;

    // --------------------------------------------------------
    // Atmospheric scattering (subtle)
    // --------------------------------------------------------
    vec2 dir = normalize(p);
    vec2 sunDir = normalize(sunPos);
    float cosTheta = dot(dir, sunDir);

    float ray = rayleighPhase(cosTheta) * 0.5;
    float mie = hgPhase(cosTheta, 0.85) * 0.25;

    vec3 rayColor = vec3(0.45, 0.65, 1.0) * ray;
    vec3 mieColor = sunCol * mie;

    skyColor += rayColor + mieColor * 0.6;

    // --------------------------------------------------------
    // CLOUD LAYER AT AIRPLANE ALTITUDE
    // --------------------------------------------------------
    // We treat clouds as a horizontal slab around uv.y ~ 0.5
    float cloudBandCenter = 0.5;
    float cloudBandHeight = 0.35; // thickness of visible band

    float bandMask = smoothstep(cloudBandCenter - cloudBandHeight,
                                cloudBandCenter,
                                uv.y) *
                     (1.0 - smoothstep(cloudBandCenter,
                                       cloudBandCenter + cloudBandHeight,
                                       uv.y));

    // world-space for clouds (move with time)
    vec2 cloudUV = p * 3.0;
    cloudUV.x += uTime * 0.03;
    cloudUV.y += sin(uTime * 0.1) * 0.05;

    float baseCloud = fbm(cloudUV);
    float detailCloud = fbm(cloudUV * 2.5);
    float cloudField = baseCloud * 0.7 + detailCloud * 0.3;

    // shape threshold
    float cloudMask = smoothstep(0.55, 0.8, cloudField);

    // weather control: more clouds for higher uWeather
    float cloudAmount = mix(0.15, 0.85, clamp(uWeather, 0.0, 1.0));
    cloudMask *= cloudAmount;

    // color of clouds depends on phase
    vec3 cloudDay = vec3(1.0, 1.0, 1.0);
    vec3 cloudSunrise = vec3(1.0, 0.75, 0.85);
    vec3 cloudSunset  = vec3(1.0, 0.70, 0.80);

    vec3 cloudColor;
    if (phase < 0.5) {
        float t = phase / 0.5;
        cloudColor = mix(cloudSunrise, cloudDay, t);
    } else {
        float t = (phase - 0.5) / 0.5;
        cloudColor = mix(cloudDay, cloudSunset, t);
    }

    // clouds get lit more strongly near sun
    float sunInfluence = exp(-dist * 3.0);
    cloudColor += sunCol * sunInfluence * 0.4;

    // apply band + mask
    float finalCloudMask = cloudMask * bandMask;

    // soft blend clouds into sky
    skyColor = mix(skyColor, cloudColor, finalCloudMask * 0.9);

    // --------------------------------------------------------
    // Slight vertical gradient darkening above you (airplane cabin feel)
    // --------------------------------------------------------
    float cabinDark = smoothstep(0.4, 1.0, uv.y);
    skyColor *= mix(1.0, 0.92, cabinDark * 0.2);

    // --------------------------------------------------------
    // Dithering
    // --------------------------------------------------------
    skyColor += hash(gl_FragCoord.xy) * 0.004;

    gl_FragColor = vec4(skyColor, 1.0);
}
