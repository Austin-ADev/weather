precision mediump float;

uniform float uLightning;
varying vec2 vUv;

float n(vec2 p){
    return fract(sin(dot(p, vec2(23.1, 91.7))) * 12345.678);
}

void main(){
    vec2 uv = vUv;

    vec3 sky = mix(
        vec3(0.12, 0.14, 0.22),
        vec3(0.05, 0.06, 0.10),
        uv.y
    );

    float c = n(uv * 2.5);
    c = smoothstep(0.4, 0.75, c);

    vec3 clouds = mix(vec3(0.2), vec3(0.35), c);

    // Stylized lightning pulse
    vec3 lightning = vec3(uLightning * 1.2);

    gl_FragColor = vec4(sky + clouds * 0.6 + lightning, 1.0);
}
