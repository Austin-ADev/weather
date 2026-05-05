precision mediump float;

varying vec2 vUv;

float n(vec2 p){
    return fract(sin(dot(p, vec2(23.1, 91.7))) * 12345.678);
}

void main(){
    vec2 uv = vUv;

    // Clean stylized sky gradient
    vec3 sky = mix(
        vec3(0.55, 0.75, 1.0),
        vec3(0.30, 0.55, 0.95),
        uv.y
    );

    // Soft cartoon cloud blobs
    float c = n(uv * 1.8);
    c = smoothstep(0.6, 0.8, c);

    vec3 clouds = mix(vec3(1.0), vec3(0.92), c);

    gl_FragColor = vec4(sky + clouds * 0.12, 1.0);
}
