precision mediump float;

varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;
uniform int uMode;    // 0 clear, 1 partly, 2 rain, 3 storm, 4 snow, 5 night
uniform int uQuality;

// -----------------------------------------------------
// HASH / NOISE / FBM
// -----------------------------------------------------
float hash(vec2 p){
    return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
}

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

// -----------------------------------------------------
// SKY COLOR BY MODE
// -----------------------------------------------------
vec3 skyColor(float h, int mode){
    if(mode == 5) return mix(vec3(0.02,0.03,0.08), vec3(0.01,0.02,0.05), h); // night
    if(mode == 3) return mix(vec3(0.15,0.16,0.2), vec3(0.05,0.05,0.08), h);  // storm
    if(mode == 2) return mix(vec3(0.35,0.4,0.5), vec3(0.1,0.1,0.15), h);     // rain
    if(mode == 4) return mix(vec3(0.85,0.9,1.0), vec3(0.6,0.7,0.9), h);      // snow
    if(mode == 1) return mix(vec3(0.6,0.75,1.0), vec3(0.3,0.4,0.7), h);      // partly
    return mix(vec3(0.55,0.75,1.0), vec3(0.2,0.35,0.7), h);                  // clear
}

// -----------------------------------------------------
// SUN
// -----------------------------------------------------
vec3 addSun(vec3 col, vec2 uv, float t, int mode){
    if(mode == 5 || mode == 3 || mode == 2) return col; // no strong sun in night/storm/rain

    vec2 sunPos = vec2(0.75, 0.85);
    float d = distance(uv, sunPos);

    float core  = smoothstep(0.05, 0.02, d);
    float halo  = smoothstep(0.25, 0.05, d);
    float bloom = smoothstep(0.6, 0.2, d);

    vec3 sunColor = vec3(1.0, 0.96, 0.88);

    col += sunColor * core * 2.0;
    col += sunColor * halo * 0.5;
    col += sunColor * bloom * 0.25;

    return col;
}

// -----------------------------------------------------
// STARS (NIGHT)
// -----------------------------------------------------
float stars(vec2 uv, float t){
    float s = 0.0;
    vec2 p = uv * 80.0;
    s += step(0.995, noise(p + t*0.02));
    s += step(0.997, noise(p * 1.7 - t*0.015));
    return s;
}

// -----------------------------------------------------
// RAIN STREAKS
// -----------------------------------------------------
float rain(vec2 uv, float t){
    uv.y += t * 2.0;
    uv.x += sin(uv.y * 10.0) * 0.02;
    float n = noise(uv * vec2(20.0, 5.0));
    float streak = smoothstep(0.8, 1.0, n);
    return streak;
}

// -----------------------------------------------------
// LIGHTNING (STORM)
// -----------------------------------------------------
float lightning(float t){
    float f = fract(t * 0.5);
    float flash = step(f, 0.02) + step(abs(f-0.15), 0.02);
    return flash;
}

// -----------------------------------------------------
// MAIN
// -----------------------------------------------------
void main(){
    float h = vUv.y;
    float t = uTime;
    float q = float(uQuality);

    // keep uResolution alive
    if (uResolution.x < 0.0) { gl_FragColor = vec4(1.0,0.0,0.0,1.0); return; }
    if (uResolution.y < 0.0) discard;
    float aspect = uResolution.x / max(uResolution.y, 1.0);

    // base sky
    vec3 col = skyColor(h, uMode);

    // refraction
    float refractStrength = 0.0015 + q * 0.0007;
    vec2 refractUV = vUv + vec2(
        noise(vUv * 6.0 + t * 0.2),
        noise(vUv * 6.0 - t * 0.17)
    ) * refractStrength;

    // drift
    vec2 driftLow = vec2(
        sin(t * 0.07) * 0.08,
        cos(t * 0.05) * 0.04
    );
    vec2 driftHigh = vec2(
        sin(t * 0.03 + 1.0) * 0.05,
        cos(t * 0.02 + 2.0) * 0.03
    );

    // low clouds
    float low = fbm(refractUV * (3.0 + q) + driftLow);
    // high wispy clouds
    float high = fbm(refractUV * (8.0 + q) + driftHigh);

    // mode-specific cloud shaping
    float lowCloud = 0.0;
    float highCloud = 0.0;

    if(uMode == 0){ // clear
        lowCloud  = smoothstep(0.7, 0.9, low) * 0.2;
        highCloud = smoothstep(0.8, 0.95, high) * 0.15;
    }else if(uMode == 1){ // partly cloudy
        lowCloud  = smoothstep(0.45, 0.75, low);
        highCloud = smoothstep(0.55, 0.85, high) * 0.6;
    }else if(uMode == 2){ // rain
        lowCloud  = smoothstep(0.35, 0.65, low) * 1.2;
        highCloud = smoothstep(0.5, 0.8, high) * 0.4;
    }else if(uMode == 3){ // storm
        lowCloud  = smoothstep(0.3, 0.6, low) * 1.5;
        highCloud = smoothstep(0.45, 0.75, high) * 0.7;
    }else if(uMode == 4){ // snow
        lowCloud  = smoothstep(0.4, 0.7, low) * 1.0;
        highCloud = smoothstep(0.55, 0.85, high) * 0.8;
    }else if(uMode == 5){ // night
        lowCloud  = smoothstep(0.55, 0.85, low) * 0.4;
        highCloud = smoothstep(0.65, 0.9, high) * 0.3;
    }

    float cloudCombined = clamp(lowCloud + highCloud, 0.0, 1.0);

    // apply clouds
    vec3 cloudColor = vec3(1.0);
    if(uMode == 2 || uMode == 3) cloudColor = vec3(0.8,0.82,0.85);
    if(uMode == 5) cloudColor = vec3(0.6,0.65,0.7);

    col = mix(col, cloudColor, cloudCombined * 0.8);

    // sun (clear / partly / snow)
    col = addSun(col, vUv, t, uMode);

    // rain
    if(uMode == 2){
        float r = rain(vUv * vec2(1.0, 1.5), t);
        col = mix(col, vec3(0.7,0.75,0.8), r * 0.4);
    }

    // storm lightning
    if(uMode == 3){
        float flash = lightning(t);
        col += vec3(0.8,0.85,1.0) * flash * 0.8;
    }

    // night stars
    if(uMode == 5){
        float s = stars(vUv, t);
        col += vec3(1.0,0.98,0.9) * s * 0.8;
    }

    // subtle aspect influence
    col += vec3(aspect * 0.0008);

    gl_FragColor = vec4(col, 1.0);
}
