precision highp float;

uniform float uTime;
varying vec2 vUv;

float noise(vec2 p){
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main(){
    vec2 uv = vUv;

    // Dark stormy sky
    vec3 sky = mix(
        vec3(0.30, 0.35, 0.45),
        vec3(0.15, 0.18, 0.25),
        uv.y
    );

    // Heavy cloud mass
    float c = noise(uv * 5.0 + uTime * 0.05);
    c += noise(uv * 10.0 + uTime * 0.1) * 0.5;
    c = smoothstep(0.3, 0.7, c);

    vec3 clouds = mix(vec3(0.4), vec3(0.7), c);

    // Heavy rain streaks
    float rain = fract(uv.y * 40.0 + uTime * 3.0);
    rain = smoothstep(0.97, 1.0, rain);

    gl_FragColor = vec4(sky + clouds * 0.6 - rain * 0.25, 1.0);
}
