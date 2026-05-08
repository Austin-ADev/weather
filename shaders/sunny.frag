#ifdef GL_ES
precision highp float;
#endif

uniform float uTime;
uniform vec2  uResolution;

// ------------------------------------------------------------
// Utility
// ------------------------------------------------------------
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// ------------------------------------------------------------
// Physically‑based scattering functions
// ------------------------------------------------------------
float rayleighPhase(float cosTheta) {
    return 3.0 / (16.0 * 3.14159) * (1.0 + cosTheta * cosTheta);
}

float hgPhase(float cosTheta, float g) {
    float g2 = g * g;
    return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
}

// ------------------------------------------------------------
// Atmospheric density falloff
// ------------------------------------------------------------
float densityAtHeight(float h) {
    return exp(-h * 1.5);
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
void main() {

    // --------------------------------------------------------
    // Normalized coordinates
    // --------------------------------------------------------
    vec2 uv = gl_FragCoord.xy / uResolution.xy;

    // Aspect‑corrected world coords (centered)
    vec2 p = gl_FragCoord.xy - 0.5 * uResolution.xy;
    float scale = min(uResolution.x, uResolution.y);
    p /= scale;

    // --------------------------------------------------------
    // Sun position (fixed for now)
    // --------------------------------------------------------
    vec2 sunUV = vec2(0.32, 0.28);

    // Convert UV → world space
    vec2 sunPos = vec2(
        (sunUV.x - 0.5) * (uResolution.x / scale),
        (sunUV.y - 0.5) * (uResolution.y / scale)
    );

    float d = length(p - sunPos);

    // --------------------------------------------------------
    // Sky gradient (curved, realistic)
    // --------------------------------------------------------
    float horizon = smoothstep(-0.2, 0.6, uv.y);
    vec3 skyTop = vec3(0.15, 0.45, 1.00);
    vec3 skyMid = vec3(0.35, 0.70, 1.00);
    vec3 skyBot = vec3(0.80, 0.90, 1.00);

    vec3 skyColor =
        mix(skyBot, skyMid, smoothstep(0.0, 0.4, uv.y));
    skyColor =
        mix(skyColor, skyTop, smoothstep(0.4, 1.0, uv.y));

    // --------------------------------------------------------
    // Rayleigh + Mie scattering
    // --------------------------------------------------------
    vec2 dir = normalize(p);
    vec2 sunDir = normalize(sunPos);

    float cosTheta = dot(dir, sunDir);

    float ray = rayleighPhase(cosTheta) * 0.6;
    float mie = hgPhase(cosTheta, 0.85) * 0.25;

    vec3 rayColor = vec3(0.45, 0.65, 1.0) * ray;
    vec3 mieColor = vec3(1.0, 0.85, 0.55) * mie;

    skyColor += rayColor + mieColor;

    // --------------------------------------------------------
    // Horizon fog (realistic)
    // --------------------------------------------------------
    float fog = exp(-abs(uv.y - 0.0) * 8.0);
    skyColor = mix(skyColor, vec3(0.85, 0.90, 1.0), fog * 0.25);

    // --------------------------------------------------------
    // Sun disc (physically‑based)
    // --------------------------------------------------------
    float sunRadius = 0.07;
    float disc = smoothstep(sunRadius, sunRadius * 0.6, d);

    vec3 sunColor = vec3(1.0, 0.92, 0.65); // 5800K color temp
    skyColor += sunColor * disc * 1.8;

    // --------------------------------------------------------
    // Solar bloom (soft)
    // --------------------------------------------------------
    float bloom = exp(-8.0 * d);
    skyColor += vec3(1.0, 0.95, 0.85) * bloom * 0.8;

    // --------------------------------------------------------
    // Heat haze shimmer
    // --------------------------------------------------------
    float shimmer = sin((p.y * 40.0) + uTime * 3.0) * 0.002;
    skyColor += shimmer * vec3(0.02, 0.015, 0.01);

    // --------------------------------------------------------
    // Subtle chromatic dispersion
    // --------------------------------------------------------
    float cd = exp(-6.0 * d);
    skyColor.r += cd * 0.03;
    skyColor.b += cd * 0.01;

    // --------------------------------------------------------
    // Dithering
    // --------------------------------------------------------
    skyColor += hash(gl_FragCoord.xy) * 0.004;

    gl_FragColor = vec4(skyColor, 1.0);
}
