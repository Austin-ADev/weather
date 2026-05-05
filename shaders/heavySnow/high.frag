precision highp float;

uniform float uTime;
varying vec2 vUv;

// Noise for cloud shaping
float noise(vec2 p){
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main(){
    vec2 uv = vUv;

    // Cold, overcast winter sky
    vec3 sky = mix(
        vec3(0.80, 0.85, 0.92),
        vec3(0.65, 0.70, 0.78),
        uv.y
    );

    // Thick winter cloud mass
    float c = noise(uv * 3.0 + uTime * 0.02);
    c += noise(uv * 6.0 + uTime * 0.03) * 0.5;
    c = smoothstep(0.35, 0.75, c);

    vec3 clouds = mix(vec3(0.75), vec3(0.95), c);

    // Realistic snowflakes (soft, drifting)
    float flake = noise(vec2(uv.x * 200.0, uv.y * 200.0 + uTime * 1.2));
    flake = step(0.995, flake);
    flake *= smoothstep(0.0, 1.0, sin(uTime * 0.5 + uv.y * 10.0));

    gl_FragColor = vec4(sky + clouds * 0.5 + flake * 0.8, 1.0);
}
