#ifdef GL_ES
precision highp float;
#endif

uniform float uTime;
uniform vec2  uResolution;

// Tiny hash for dithering
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    vec2 p  = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;

    // ----------------------------------------------------
    // TRUE MIDDAY SKY (bright blue, no purple)
    // ----------------------------------------------------
    float t = clamp(uv.y, 0.0, 1.0);

    vec3 horizonColor = vec3(0.55, 0.78, 1.00);  // bright sky blue
    vec3 zenithColor  = vec3(0.20, 0.55, 1.00);  // deeper but still bright

    vec3 skyColor = mix(horizonColor, zenithColor, t);

    // ----------------------------------------------------
    // SUN PATH — crosses screen every 5 hours
    // ----------------------------------------------------
    float timeSec = uTime;
    float period  = 5.0 * 3600.0;
    float phase   = fract(timeSec / period);

    // Keep sun fully visible
    float sunX = mix(-0.25, 0.25, phase);
    float sunY = 0.35 + 0.20 * sin(phase * 3.14159);

    vec2 sunPos = vec2(sunX, sunY);

    float d = length(p - sunPos);

    // ----------------------------------------------------
    // SMALLER GOLDEN SUN
    // ----------------------------------------------------
    float sunRadius = 0.12;  // smaller
    float sunDisc   = smoothstep(sunRadius, sunRadius * 0.75, d);

    vec3 sunColor = vec3(1.0, 0.92, 0.55);  // golden daylight sun

    // ----------------------------------------------------
    // DAYTIME GLOW (soft, warm)
    // ----------------------------------------------------
    float offset = 0.0025;

    float dR = length((p + vec2( offset, 0.0)) - sunPos);
    float dG = length((p + vec2( 0.0,  offset)) - sunPos);
    float dB = length((p + vec2(-offset, 0.0)) - sunPos);

    float glowR = exp(-7.0 * dR);
    float glowG = exp(-7.0 * dG);
    float glowB = exp(-7.0 * dB);

    vec3 refractGlow = vec3(glowR, glowG, glowB) * 0.35;

    // ----------------------------------------------------
    // VERY SUBTLE LENS RING (daytime)
    // ----------------------------------------------------
    float ringRadius    = 0.18;
    float ringThickness = 0.008;

    float ringR = smoothstep(ringRadius + ringThickness*1.3,
                             ringRadius,
                             length((p + vec2(0.003, 0.0)) - sunPos));

    float ringG = smoothstep(ringRadius + ringThickness*1.1,
                             ringRadius,
                             length((p + vec2(0.0, 0.003)) - sunPos));

    float ringB = smoothstep(ringRadius + ringThickness*0.9,
                             ringRadius,
                             length((p + vec2(-0.003, 0.0)) - sunPos));

    vec3 lensRing = vec3(ringR, ringG, ringB) * 0.15;

    // ----------------------------------------------------
    // VERY LIGHT STREAK (daytime)
    // ----------------------------------------------------
    float streak = exp(-20.0 * abs(p.y - sunPos.y)) *
                   exp(-3.0  * abs(p.x - sunPos.x));

    vec3 lensStreak = vec3(1.0, 0.95, 0.75) * streak * 0.08;

    // ----------------------------------------------------
    // ATMOSPHERIC SCATTERING (blue, not purple)
    // ----------------------------------------------------
    float scatter = exp(-4.0 * d);
    skyColor += scatter * vec3(0.40, 0.55, 0.85);

    // ----------------------------------------------------
    // FINAL COLOR
    // ----------------------------------------------------
    vec3 color = skyColor;

    color += sunColor * sunDisc;
    color += refractGlow;
    color += lensRing;
    color += lensStreak;

    // Dither to remove banding
    color += hash(gl_FragCoord.xy) * 0.01;

    gl_FragColor = vec4(color, 1.0);
}
