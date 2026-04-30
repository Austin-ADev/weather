precision mediump float;

varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;
uniform int uMode;
uniform int uQuality;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
    float h = vUv.y;

    // simple sky colors
    vec3 col =
        (uMode == 5) ? mix(vec3(0.02,0.03,0.08), vec3(0.01,0.02,0.05), h) :
        (uMode == 3) ? mix(vec3(0.2,0.2,0.25), vec3(0.05,0.05,0.08), h) :
        (uMode == 2) ? mix(vec3(0.4,0.45,0.55), vec3(0.1,0.1,0.15), h) :
        (uMode == 4) ? mix(vec3(0.9,0.95,1.0), vec3(0.6,0.7,0.9), h) :
        (uMode == 1) ? mix(vec3(0.7,0.75,0.85), vec3(0.3,0.35,0.45), h) :
                       mix(vec3(0.6,0.75,1.0), vec3(0.2,0.3,0.5), h);

    // tiny animated noise so uniforms are used
    float n = hash(vUv * (20.0 + float(uQuality)*5.0) + uTime * 0.1);
    col += n * 0.03;

    gl_FragColor = vec4(col, 1.0);
}
