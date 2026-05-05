precision mediump float;

uniform float uTime;
varying vec2 vUv;

float n(vec2 p){
    return fract(sin(dot(p, vec2(23.1, 91.7))) * 12345.678);
}

void main(){
    vec2 uv = vUv;

    vec3 sky = mix(
        vec3(0.45, 0.50, 0.65),
        vec3(0.25, 0.30, 0.45),
        uv.y
    );

    float c = n(uv * 3.0);
    c = smoothstep(0.4, 0.75, c);

    vec3 clouds = mix(vec3(0.5), vec3(0.7), c);

    // Stylized rain streaks
    float drop = fract(uv.y * 30.0 + uTime * 2.0);
    drop = smoothstep(0.96, 1.0, drop);

    gl_FragColor = vec4(sky + clouds * 0.5 - drop * 0.2, 1.0);
}
