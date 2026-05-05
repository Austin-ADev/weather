precision mediump float;

uniform float uTime;
varying vec2 vUv;

float n(vec2 p){
    return fract(sin(dot(p, vec2(23.1, 91.7))) * 12345.678);
}

void main(){
    vec2 uv = vUv;

    // Soft stylized winter gradient
    vec3 sky = mix(
        vec3(0.90, 0.92, 0.98),
        vec3(0.75, 0.80, 0.90),
        uv.y
    );

    // Simple stylized cloud layer
    float c = n(uv * 2.0);
    c = smoothstep(0.45, 0.75, c);
    vec3 clouds = mix(vec3(0.85), vec3(0.95), c);

    // Cartoon snowflakes (simple dots)
    float flake = step(0.997, n(uv * 150.0 + vec2(0.0, uTime * 1.5)));
    flake *= 0.9;

    gl_FragColor = vec4(sky + clouds * 0.4 + flake, 1.0);
}
