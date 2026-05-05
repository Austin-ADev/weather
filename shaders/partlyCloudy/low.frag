precision mediump float;

varying vec2 vUv;

float n(vec2 p){
    return fract(sin(dot(p, vec2(23.1, 91.7))) * 12345.678);
}

void main(){
    vec2 uv = vUv;

    vec3 sky = mix(
        vec3(0.45, 0.65, 1.0),
        vec3(0.25, 0.45, 0.9),
        uv.y
    );

    float c = n(uv * 2.5);
    c = smoothstep(0.5, 0.75, c);

    vec3 clouds = mix(vec3(1.0), vec3(0.9), c);

    gl_FragColor = vec4(sky + clouds * 0.35, 1.0);
}
