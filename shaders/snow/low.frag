precision mediump float;

uniform float uTime;
varying vec2 vUv;

float n(vec2 p){
    return fract(sin(dot(p, vec2(23.1, 91.7))) * 12345.678);
}

void main(){
    vec2 uv = vUv;

    vec3 sky = mix(
        vec3(0.90, 0.95, 1.0),
        vec3(0.75, 0.80, 0.90),
        uv.y
    );

    float c = n(uv * 2.0);
    c = smoothstep(0.5, 0.8, c);

    vec3 clouds = mix(vec3(0.9), vec3(1.0), c);

    // Cartoon snow dots
    float flake = step(0.997, n(uv * 120.0 + vec2(0.0, uTime * 1.2)));
    flake *= 0.9;

    gl_FragColor = vec4(sky + clouds * 0.3 + flake, 1.0);
}
