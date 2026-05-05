precision highp float;

uniform float uTime;
uniform float uLightning;
varying vec2 vUv;

float noise(vec2 p){
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main(){
    vec2 uv = vUv;

    // Dark stormy night gradient
    vec3 sky = mix(
        vec3(0.01, 0.01, 0.03),
        vec3(0.00, 0.00, 0.01),
        uv.y
    );

    // Heavy clouds
    float c = noise(uv * 4.0 + uTime * 0.05);
    c += noise(uv * 8.0 + uTime * 0.1) * 0.5;
    c = smoothstep(0.3, 0.65, c);

    vec3 clouds = mix(vec3(0.05), vec3(0.15), c);

    // Lightning flash
    float flash = smoothstep(0.0, 1.0, uLightning);
    vec3 lightning = vec3(flash * 1.5);

    gl_FragColor = vec4(sky + clouds * 0.7 + lightning, 1.0);
}
