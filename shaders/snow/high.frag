precision highp float;

uniform float uTime;
varying vec2 vUv;

float noise(vec2 p){
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main(){
    vec2 uv = vUv;

    // Cold winter sky
    vec3 sky = mix(
        vec3(0.80, 0.88, 0.95),
        vec3(0.65, 0.72, 0.82),
        uv.y
    );

    // Light winter clouds
    float c = noise(uv * 3.0 + uTime * 0.02);
    c = smoothstep(0.45, 0.75, c);

    vec3 clouds = mix(vec3(0.85), vec3(0.95), c);

    // Soft drifting snowflakes
    float flake = noise(vec2(uv.x * 150.0, uv.y * 150.0 + uTime * 1.0));
    flake = step(0.996, flake);
    flake *= 0.8;

    gl_FragColor = vec4(sky + clouds * 0.35 + flake, 1.0);
}
