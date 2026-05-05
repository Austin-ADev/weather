precision highp float;

uniform float uTime;
varying vec2 vUv;

float noise(vec2 p){
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main(){
    vec2 uv = vUv;

    // Brighter sky than heavy rain
    vec3 sky = mix(
        vec3(0.55, 0.65, 0.80),
        vec3(0.35, 0.45, 0.60),
        uv.y
    );

    // Puffy shower clouds
    float c = noise(uv * 3.0 + uTime * 0.03);
    c += noise(uv * 6.0 + uTime * 0.05) * 0.5;
    c = smoothstep(0.4, 0.75, c);

    vec3 clouds = mix(vec3(0.8), vec3(0.95), c);

    // Rain bursts
    float streak = fract(uv.y * 30.0 + uTime * 2.5);
    streak = smoothstep(0.965, 1.0, streak);

    gl_FragColor = vec4(sky + clouds * 0.45 - streak * 0.2, 1.0);
}
