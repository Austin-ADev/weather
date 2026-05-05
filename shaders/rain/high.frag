precision highp float;

uniform float uTime;
varying vec2 vUv;

float noise(vec2 p){
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main(){
    vec2 uv = vUv;

    // Realistic rainy sky gradient
    vec3 sky = mix(
        vec3(0.45, 0.50, 0.60),
        vec3(0.25, 0.30, 0.40),
        uv.y
    );

    // Cloud mass
    float c = noise(uv * 4.0 + uTime * 0.04);
    c += noise(uv * 8.0 + uTime * 0.06) * 0.5;
    c = smoothstep(0.35, 0.75, c);

    vec3 clouds = mix(vec3(0.5), vec3(0.75), c);

    // Rain streaks
    float streak = fract(uv.y * 35.0 + uTime * 2.2);
    streak = smoothstep(0.96, 1.0, streak);

    gl_FragColor = vec4(sky + clouds * 0.5 - streak * 0.18, 1.0);
}
