precision mediump float;

varying vec2 vUv;

void main(){
    vec2 uv = vUv;

    // Clean stylized sky gradient
    vec3 sky = mix(
        vec3(0.50, 0.75, 1.0),
        vec3(0.25, 0.55, 0.95),
        uv.y
    );

    gl_FragColor = vec4(sky, 1.0);
}
