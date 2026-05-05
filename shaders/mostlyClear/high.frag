precision highp float;

uniform float uTime;
varying vec2 vUv;

float noise(vec2 p){
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main(){
    vec2 uv = vUv;

    // Realistic bright sky gradient
    vec3 sky = mix(
        vec3(0.45, 0.70, 1.00),
        vec3(0.20, 0.45, 0.90),
        uv.y
    );

    // Very light cloud wisps
    float c = noise(uv * 2.0 + uTime * 0.02);
    c = smoothstep(0.55, 0.75, c);

    vec3 clouds = mix(vec3(1.0), vec3(0.9), c);

    gl_FragColor = vec4(sky + clouds * 0.15, 1.0);
}
