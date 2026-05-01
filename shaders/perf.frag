precision mediump float;
varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;
uniform int uMode;
uniform float uSeed;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) +
           (c - a) * u.y * (1.0 - u.x) +
           (d - b) * u.x * u.y;
}

void main() {
    float h = vUv.y;
    vec3 top = vec3(0.15, 0.2, 0.35);
    vec3 bottom = vec3(0.02, 0.03, 0.08);
    vec3 col = mix(bottom, top, h);

    vec2 uv = vUv;
    uv += vec2(sin(uTime * 0.05 + uSeed) * 0.02, 0.0);
    float n = noise(uv * 4.0 + uSeed);
    float clouds = smoothstep(0.55, 0.8, n) * 0.4;

    col = mix(col, vec3(1.0), clouds);

    vec2 sunPos = vec2(0.8, 0.85);
    float d = distance(vUv, sunPos);
    float sun = smoothstep(0.12, 0.0, d);
    col += vec3(1.0, 0.95, 0.85) * sun * 0.8;

    gl_FragColor = vec4(col, 1.0);
}
