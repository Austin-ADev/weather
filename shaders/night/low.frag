precision mediump float;

varying vec2 vUv;

void main() {
    vec2 uv = vUv;

    // Clean stylized gradient
    vec3 col = mix(
        vec3(0.05, 0.07, 0.20),
        vec3(0.01, 0.02, 0.08),
        uv.y
    );

    // Simple dot stars
    float s = step(0.9985, fract(sin(dot(uv * 500.0, vec2(12.9898,78.233))) * 43758.5453));
    col += s * 0.8;

    gl_FragColor = vec4(col, 1.0);
}
