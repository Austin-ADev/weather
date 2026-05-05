precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform float uDayPhase;

varying vec2 vUv;

// Simple star noise
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

void main() {
    vec2 uv = vUv;

    // Realistic night gradient
    vec3 sky = mix(
        vec3(0.02, 0.03, 0.08),
        vec3(0.00, 0.00, 0.02),
        uv.y
    );

    // Stars
    float star = step(0.9975, hash(uv * 800.0));
    star *= smoothstep(0.0, 1.0, sin(uTime * 0.5 + hash(uv * 200.0) * 6.28));

    vec3 col = sky + star * 1.2;

    gl_FragColor = vec4(col, 1.0);
}
