precision mediump float;

uniform float uTime;
varying vec2 vUv;

float n(vec2 p){
    return fract(sin(dot(p, vec2(23.1, 91.7))) * 12345.678);
}

void main(){
    vec2 uv = vUv;

    vec3 sky = mix(
        vec3(0.65, 0.75, 0.90),
        vec3(0.45, 0.55, 0.75),
        uv.y
    );

    float c = n(uv * 2.0);
    c = smoothstep(0.5, 0.8, c);

    vec3 clouds = mix(vec3(0.9), vec3(1.0), c);

    // Stylized shower streaks
    float drop = fract(uv.y * 22.0 + uTime * 2.0);
    drop = smoothstep(0.96, 1.0, drop);

    gl_FragColor = vec4(sky + clouds * 0.35 - drop * 0.15, 1.0);
}
