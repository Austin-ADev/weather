precision highp float;

uniform float uTime;
varying vec2 vUv;

float noise(vec2 p){
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main(){
    vec2 uv = vUv;

    // Soft gray sky
    vec3 sky = mix(
        vec3(0.60, 0.65, 0.75),
        vec3(0.45, 0.50, 0.60),
        uv.y
    );

    // Light drizzle cloud texture
    float c = noise(uv * 4.0 + uTime * 0.03);
    c = smoothstep(0.4, 0.7, c);

    vec3 clouds = mix(vec3(0.75), vec3(0.90), c);

    // Light rain streaks
    float rain = fract(uv.y * 20.0 + uTime * 1.5);
    rain = smoothstep(0.95, 1.0, rain);

    gl_FragColor = vec4(sky + clouds * 0.4 - rain * 0.1, 1.0);
}
