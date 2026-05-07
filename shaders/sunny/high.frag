#ifdef GL_ES
precision highp float;
#endif

uniform float u_time;        // seconds since start
uniform vec2  u_resolution;  // viewport size

// Tiny hash for dithering
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;

    // Aspect-corrected centered coordinates
    vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

    // ----------------------------------------------------
    // SKY GRADIENT
    // ----------------------------------------------------
    float t = clamp(uv.y, 0.0, 1.0);
    vec3 horizonColor = vec3(0.15, 0.25, 0.55);
    vec3 zenithColor  = vec3(0.02, 0.05, 0.15);
    vec3 skyColor = mix(horizonColor, zenithColor, t);

    // ----------------------------------------------------
    // SUN PATH — crosses screen every 5 hours
    // ----------------------------------------------------
    float period = 5.0 * 3600.0;      // 5 hours in seconds
    float phase = fract(u_time / period);

    float sunX = mix(-0.8, 0.8, phase);
    float sunY = 0.2 + 0.4 * sin(phase * 3.14159);

    vec2 sunPos = vec2(sunX, sunY);

    float d = length(p - sunPos);

    // Sun disc
    float sunRadius = 0.12;
    float sunDisc = smoothstep(sunRadius, sunRadius * 0.8, d);
    vec3 sunColor = vec3(1.0, 0.95, 0.85);

    // ----------------------------------------------------
    // CHROMATIC GLOW
    // ----------------------------------------------------
    float offset = 0.003;

    float dR = length((p + vec2( offset, 0.0)) - sunPos);
    float dG = length((p + vec2( 0.0,  offset)) - sunPos);
    float dB = length((p + vec2(-offset, 0.0)) - sunPos);

    float glowR = exp(-12.0 * dR);
    float glowG = exp(-11.0 * dG);
    float glowB = exp(-10.0 * dB);

    vec3 refractGlow = vec3(glowR, glowG, glowB) * 1.4;

    // ----------------------------------------------------
    // LENS RING (camera refraction halo)
    // ----------------------------------------------------
    float ringRadius = 0.28;
    float ringThickness = 0.015;

    float ring = smoothstep(ringRadius + ringThickness,
                            ringRadius,
                            d);

    float ringR = smoothstep(ringRadius + ringThickness*1.4,
                             ringRadius,
                             length((p + vec2(0.004, 0.0)) - sunPos));

    float ringG = smoothstep(ringRadius + ringThickness*1.2,
                             ringRadius,
                             length((p + vec2(0.0, 0.004)) - sunPos));

    float ringB = smoothstep(ringRadius + ringThickness*1.0,
                             ringRadius,
                             length((p + vec2(-0.004, 0.0)) - sunPos));

    vec3 lensRing = vec3(ringR, ringG, ringB) * 0.35;

    // ----------------------------------------------------
    // LENS STREAK (horizontal flare)
    // ----------------------------------------------------
    float streak = exp(-40.0 * abs(p.y - sunPos.y)) *
                   exp(-6.0 * abs(p.x - sunPos.x));

    vec3 lensStreak = vec3(1.0, 0.8, 0.6) * streak * 0.25;

    // ----------------------------------------------------
    // ATMOSPHERIC SCATTERING
    // ----------------------------------------------------
    float scatter = exp(-8.0 * d);
    skyColor += scatter * vec3(0.2, 0.25, 0.35);

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
