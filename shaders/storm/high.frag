precision highp float;

uniform float uTime;
uniform float uLightning;
varying vec2 vUv;

float noise(vec2 p){
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main(){
    vec2 uv = vUv;

    // Dark storm sky
    vec3 sky = mix(
        vec3(0.10, 0.12, 0.18),
        vec3(0.04, 0.05, 0.08),
        uv.y
    );

    // Heavy storm clouds
    float c = noise(uv * 3.0 + uTime * 0.05);
    c += noise(uv * 6.0 + uTime * 0.1) * 0.5;
    c = smoothstep(0.3, 0.7, c);

    vec3 clouds = mix(vec3(0.15), vec3(0.35), c);

    // Realistic lightning flash
    float flash = smoothstep(0.0, 1.0, uLightning);
    vec3 lightning = vec3(flash * 1.4);

    gl_FragColor = vec4(sky + clouds * 0.7 + lightning, 1.0);
}
