precision highp float;

varying vec2 vUv;

void main(){
    vec2 uv = vUv;

    // Realistic clear sky gradient
    vec3 sky = mix(
        vec3(0.35, 0.65, 1.00),
        vec3(0.10, 0.40, 0.90),
        uv.y
    );

    gl_FragColor = vec4(sky, 1.0);
}
