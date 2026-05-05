precision highp float;

uniform float uTime;
uniform vec2  uResolution;

varying vec2 vUv;

float noise(vec2 p){
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main(){
    vec2 uv = vUv;

    // Base night gradient
    vec3 sky = mix(
        vec3(0.03, 0.04, 0.10),
        vec3(0.00, 0.00, 0.03),
        uv.y
    );

    // Soft realistic clouds
    float c = noise(uv * 4.0 + uTime * 0.02);
    c += noise(uv * 8.0 + uTime * 0.03) * 0.5;
    c = smoothstep(0.45, 0.7, c);

    vec3 clouds = mix(vec3(0.05, 0.06, 0.10), vec3(0.15, 0.16, 0.20), c);

    gl_FragColor = vec4(sky + clouds * 0.6, 1.0);
}
