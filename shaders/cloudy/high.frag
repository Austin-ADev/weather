precision highp float;

uniform float uTime;
varying vec2 vUv;

float noise(vec2 p){
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main(){
    vec2 uv = vUv;

    // Realistic overcast gradient
    vec3 sky = mix(
        vec3(0.55, 0.60, 0.70),
        vec3(0.40, 0.45, 0.55),
        uv.y
    );

    // Thick cloud layers
    float c = noise(uv * 3.0 + uTime * 0.02);
    c += noise(uv * 6.0 + uTime * 0.03) * 0.5;
    c = smoothstep(0.35, 0.75, c);

    vec3 clouds = mix(vec3(0.75), vec3(0.90), c);

    gl_FragColor = vec4(sky + clouds * 0.5, 1.0);
}
