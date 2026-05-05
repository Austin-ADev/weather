precision mediump float;

uniform float uFogDensity;
varying vec2 vUv;

void main(){
    vec2 uv = vUv;

    vec3 sky = mix(
        vec3(0.80, 0.82, 0.88),
        vec3(0.70, 0.72, 0.80),
        uv.y
    );

    float fog = (1.0 - uv.y) * uFogDensity * 1.8;

    vec3 col = mix(sky, vec3(0.90, 0.92, 0.95), fog);

    gl_FragColor = vec4(col, 1.0);
}
