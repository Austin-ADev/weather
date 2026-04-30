precision mediump float;

varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;
uniform int uMode;
uniform int uQuality;

// hash
float hash(vec2 p){
    return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
}

// noise
float noise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0,0.0));
    float c = hash(i + vec2(0.0,1.0));
    float d = hash(i + vec2(1.0,1.0));
    vec2 u = f*f*(3.0 - 2.0*f);
    return mix(a,b,u.x) +
           (c-a)*u.y*(1.0-u.x) +
           (d-b)*u.x*u.y;
}

// fbm
float fbm(vec2 p){
    float v = 0.0;
    float a = 0.5;
    for(int i=0;i<5;i++){
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
    }
    return v;
}

// sky gradient
vec3 skyColor(float h, int mode){
    if(mode == 5) return mix(vec3(0.02,0.03,0.08), vec3(0.01,0.02,0.05), h);
    if(mode == 3) return mix(vec3(0.2,0.2,0.25), vec3(0.05,0.05,0.08), h);
    if(mode == 2) return mix(vec3(0.4,0.45,0.55), vec3(0.1,0.1,0.15), h);
    if(mode == 4) return mix(vec3(0.9,0.95,1.0), vec3(0.6,0.7,0.9), h);
    if(mode == 1) return mix(vec3(0.7,0.75,0.85), vec3(0.3,0.35,0.45), h);
    return mix(vec3(0.6,0.75,1.0), vec3(0.2,0.3,0.5), h);
}

void main(){
    float h = vUv.y;

    // use resolution
    float aspect = uResolution.x / max(uResolution.y, 1.0);

    // use time
    float t = uTime * 0.03;

    // use quality
    float q = float(uQuality);

    // base sky
    vec3 col = skyColor(h, uMode);

    // clouds
    float c = fbm(vUv * (3.0 + q) + vec2(t, t*0.5));
    float cloud = smoothstep(0.5, 0.8, c);

    col = mix(col, vec3(1.0), cloud * 0.6);

    gl_FragColor = vec4(col, 1.0);
}
