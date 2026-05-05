precision mediump float;

uniform float uLightning;
varying vec2 vUv;

float n(vec2 p){
    return fract(sin(dot(p, vec2(23.1, 91.7))) * 12345.678);
}

void main(){
    vec2 uv = vUv;

    vec3 sky = mix(
        vec3(0.02, 0.02, 0.08),
        vec3(0.00, 0.00, 0.04),
        uv.y
    );

    float c = n(uv * 3.0);
    c = smoothstep(0.35, 0.7, c);

    vec3 clouds = mix(vec3(0.1), vec3(0.2), c);

    vec3 lightning = vec3(uLightning * 1.2);

    gl_FragColor = vec4(sky + clouds * 0.6 + lightning, 1.0);
}
