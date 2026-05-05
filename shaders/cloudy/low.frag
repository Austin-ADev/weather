precision mediump float;

varying vec2 vUv;

float n(vec2 p){
    return fract(sin(dot(p, vec2(23.1, 91.7))) * 12345.678);
}

void main(){
    vec2 uv = vUv;

    vec3 sky = mix(
        vec3(0.70, 0.75, 0.85),
        vec3(0.55, 0.60, 0.75),
        uv.y
    );

    float c = n(uv * 2.0);
    c = smoothstep(0.45, 0.75, c);

    vec3 clouds = mix(vec3(0.85), vec3(0.95), c);

    gl_FragColor = vec4(sky + clouds * 0.4, 1.0);
}
