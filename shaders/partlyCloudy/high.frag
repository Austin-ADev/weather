precision highp float;

uniform float uTime;
varying vec2 vUv;

float noise(vec2 p){
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main(){
    vec2 uv = vUv;

    // Realistic sky gradient
    vec3 sky = mix(
        vec3(0.35, 0.55, 0.95),
        vec3(0.15, 0.30, 0.75),
        uv.y
    );

    // Soft realistic clouds
    float c = noise(uv * 3.0 + uTime * 0.03);
    c += noise(uv * 6.0 + uTime * 0.05) * 0.5;
    c = smoothstep(0.45, 0.7, c);

    vec3 clouds = mix(vec3(1.0), vec3(0.85), c);

    gl_FragColor = vec4(sky + clouds * 0.4, 1.0);
}
