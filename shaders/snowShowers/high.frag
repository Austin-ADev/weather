precision highp float;

uniform float uTime;
varying vec2 vUv;

float noise(vec2 p){
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main(){
    vec2 uv = vUv;

    // Cold sky gradient
    vec3 sky = mix(
        vec3(0.82, 0.88, 0.96),
        vec3(0.68, 0.74, 0.84),
        uv.y
    );

    // Light winter cloud texture
    float c = noise(uv * 3.0 + uTime * 0.03);
    c += noise(uv * 6.0 + uTime * 0.05) * 0.5;
    c = smoothstep(0.45, 0.75, c);

    vec3 clouds = mix(vec3(0.85), vec3(0.95), c);

    // Snow shower flakes (more frequent than normal snow)
    float flake = noise(vec2(uv.x * 180.0, uv.y * 180.0 + uTime * 1.4));
    flake = step(0.993, flake);
    flake *= 0.9;

    gl_FragColor = vec4(sky + clouds * 0.35 + flake, 1.0);
}
