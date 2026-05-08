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

// Simple Rayleigh scattering curve
float rayleigh(float cosTheta) {
    return 0.75 * (1.0 + cosTheta * cosTheta);
}

// Simple Mie scattering curve
float mie(float cosTheta, float g) {
    float g2 = g * g;
    return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
}

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
p.x *= uResolution.y / uResolution.x;   // aspect correction


    // ----------------------------------------------------
    // FORCE MIDDAY ALWAYS
    // ----------------------------------------------------
    float day = 1.0;

    // ----------------------------------------------------
    // REALISTIC MIDDAY SKY COLORS
    // ----------------------------------------------------
    float t = clamp(uv.y, 0.0, 1.0);

    vec3 horizonColor = vec3(0.65, 0.82, 1.00);
    vec3 zenithColor  = vec3(0.20, 0.55, 1.00);

    vec3 skyColor = mix(horizonColor, zenithColor, t);

    // ----------------------------------------------------
    // SUN POSITION (shifted right)
    // ----------------------------------------------------
    float timeSec = uTime;
    float period  = 5.0 * 3600.0;
    float phase   = fract(timeSec / period);

    float sunX = mix(0.05, 0.55, phase);   // shifted right
    float sunY = 0.40 + 0.20 * sin(phase * 3.14159);

    vec2 sunPos = vec2(sunX, sunY);
    float d = length(p - sunPos);

    // ----------------------------------------------------
    // DYNAMIC SUN BRIGHTNESS (based on elevation)
    // ----------------------------------------------------
    float elevation = clamp(sunY + 0.2, 0.0, 1.0);
    float sunBrightness = pow(elevation, 1.5) * 1.4;

    vec3 sunTint = mix(
        vec3(1.0, 0.85, 0.55),   // warm low sun
        vec3(1.0, 0.95, 0.85),   // white-gold midday
        elevation
    );

    // ----------------------------------------------------
    // SUN DISC (smaller + golden)
    // ----------------------------------------------------
    float sunRadius = 0.08;
    float sunDisc   = smoothstep(sunRadius, sunRadius * 0.65, d);

    // ----------------------------------------------------
    // REALISTIC SCATTERING (Rayleigh + Mie)
    // ----------------------------------------------------
    float cosTheta = dot(normalize(p), normalize(sunPos));

    float ray = rayleigh(cosTheta) * 0.25;
    float mieS = mie(cosTheta, 0.8) * 0.15;

    vec3 scatterColor = vec3(0.45, 0.60, 0.90) * ray +
                        vec3(1.0, 0.85, 0.55) * mieS;

    skyColor += scatterColor * exp(-3.0 * d);

    // ----------------------------------------------------
    // SUN CORONA (white outer glow)
    // ----------------------------------------------------
    float corona = exp(-12.0 * d);
    vec3 coronaColor = vec3(1.0, 0.98, 0.90) * corona * 0.6 * sunBrightness;

    // ----------------------------------------------------
    // VERY SUBTLE LENS EFFECTS
    // ----------------------------------------------------
    float ring = smoothstep(0.14, 0.13, d);
    vec3 lensRing = vec3(1.0, 0.95, 0.85) * ring * 0.08 * (0.4 + 0.6 * elevation);

    float streak = exp(-18.0 * abs(p.y - sunPos.y)) *
                   exp(-3.0  * abs(p.x - sunPos.x));
    vec3 lensStreak = vec3(1.0, 0.95, 0.75) * streak * 0.05 * (0.3 + 0.7 * elevation);

    // ----------------------------------------------------
    // FINAL COLOR
    // ----------------------------------------------------
    vec3 color = skyColor;

    color += sunTint * sunDisc * sunBrightness;
    color += coronaColor;
    color += lensRing;
    color += lensStreak;

    // Dither to remove banding
    color += hash(gl_FragCoord.xy) * 0.01;

    gl_FragColor = vec4(color, 1.0);
}
