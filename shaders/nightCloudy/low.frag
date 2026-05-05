precision mediump float;

varying vec2 vUv;

float n(vec2 p){
    return fract(sin(dot(p, vec2(23.1, 91.7))) * 12345.678);
}

void main(){
    vec2 uv = vUv;

    vec3 sky = mix(
        vec3(0.06, 0.07, 0.18),
        vec3(0.02, 0.03, 0.10),
        uv.y
    );

    float c = n(uv * 3.0);
    c = smoothstep(0.4, 0.7, c);

    vec3 clouds = mix(vec3(0.1, 0.1, 0.15), vec3(0.2, 0.2, 0.25), c);

    gl_FragColor = vec4(sky + clouds * 0.5, 1.0);
}
