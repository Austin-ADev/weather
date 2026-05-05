precision mediump float;

uniform float uTime;
varying vec2 vUv;

float n(vec2 p){
    return fract(sin(dot(p, vec2(23.1, 91.7))) * 12345.678);
}

void main(){
    vec2 uv = vUv;

    vec3 sky = mix(
        vec3(0.55, 0.60, 0.75),
        vec3(0.35, 0.40, 0.55),
        uv.y
    );

    float c = n(uv * 2.5);
    c = smoothstep(0.45, 0.75, c);

    vec3 clouds = mix(vec3(0.7), vec3(0.85), c);

    // Stylized rain streaks
    float drop = fract(uv.y * 25.0 + uTime * 1.8);
    drop = smoothstep(0.95, 1.0, drop);

    gl_FragColor = vec4(sky + clouds * 0.4 - drop * 0.15, 1.0);
}
