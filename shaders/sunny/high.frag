#ifdef GL_ES
precision highp float;
#endif

uniform float u_time;        // your engine passes MINUTES, not seconds
uniform vec2  u_resolution;

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
    vec3 horizonColor = vec3(0.18, 0.28, 0.60);
    vec3 zenithColor  = vec3(0.03, 0.06, 0.18);
    vec3 skyColor = mix(horizonColor, zenithColor, t);

    // ----------------------------------------------------
    // SUN PATH — crosses screen every 5 hours
    // Your engine passes u_time in MINUTES → convert to seconds
    // ----------------------------------------------------
    float timeSec = u_time * 60.0;

    float period = 5.0 * 3600.0;      // 5 hours in seconds
    float phase = fract(timeSec / period);

    // Keep sun fully on-screen
    float sunX = mix(-0.6, 0.6, phase);
    float sunY = 0.25 + 0.35 * sin(phase * 3.14159);

    vec2 sunPos = vec2(sunX, sunY);

    float d = length(p - sunPos);

    // Sun disc
    float sunRadius = 0.10;
    float sunDisc = smoothstep(sunRadius, sunRadius * 0.75, d);
    vec3 sunColor = vec3(1.0, 0.96, 0.88);

    // ----------------------------------------------------
    // CHROMATIC GLOW
    // ----------------------------------------------------
    float offset = 0.004;

    float dR = length((p + vec2( offset, 0.0)) - sunPos);
    float dG = length((p + vec2( 0.0,  offset)) - sunPos);
    float dB = length((p + vec2(-offset, 0.0)) - sunPos);

    float glowR = exp(-10.0 * dR);
    float glowG = exp(-9.0  * dG);
    float glowB = exp(-8.0  * dB);

    vec3 refractGlow = vec3(glowR, glowG, glowB) * 1.2;

    // ----------------------------------------------------
    // LENS RING (camera refraction halo)
    // ----------------------------------------------------
    float ringRadius = 0.22;
    float ringThickness = 0.02;

    float ring = smoothstep(ringRadius + ringThickness,
                            ringRadius,
                            d);

    float ringR = smoothstep(ringRadius + ringThickness*1.4,
                             ringRadius,
                             length((p + vec2(0.006, 0.0)) - sunPos));

    float ringG = smoothstep(ringRadius + ringThickness*1.2,
                             ringRadius,
                             length((p + vec2(0.0, 0.006)) - sunPos));

    float ringB = smoothstep(ringRadius + ringThickness*1.0,
                             ringRadius,
                             length((p + vec2(-0.006, 0.0)) - sunPos));

    vec3 lensRing = vec3(ringR, ringG, ringB) * 0.45;

    // ----------------------------------------------------
    // LENS STREAK (horizontal flare)
    // ----------------------------------------------------
    float streak = exp(-30.0 * abs(p.y - sunPos.y)) *
                   exp(-4.0  * abs(p.x - sunPos.x));

    vec3 lensStreak = vec3(1.0, 0.85, 0.65) * streak * 0.35;

    // ----------------------------------------------------
    // ATMOSPHERIC SCATTERING
    // ----------------------------------------------------
    float scatter = exp(-6.0 * d);
    skyColor += scatter * vec3(0.25, 0.30, 0.40);

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
