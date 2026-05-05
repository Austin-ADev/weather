precision highp float;

uniform float uFogDensity;
varying vec2 vUv;

void main(){
    vec2 uv = vUv;

    // Base gray sky
    vec3 sky = mix(
        vec3(0.75, 0.78, 0.82),
        vec3(0.65, 0.68, 0.72),
        uv.y
    );

    // Fog thickness
    float fog = smoothstep(0.0, 1.0, 1.0 - uv.y);
    fog *= uFogDensity * 2.0;

    vec3 col = mix(sky, vec3(0.85, 0.87, 0.90), fog);

    gl_FragColor = vec4(col, 1.0);
}
