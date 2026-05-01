precision mediump float;

varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;
uniform int uMode;
uniform int uQuality;
uniform float uSeed;
uniform float uCloudLow;
uniform float uCloudHigh;
uniform float uSunIntensity;
uniform float uLightning;
uniform float uCloudSpeed;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    vec3 u = f * f * (3.0 - 2.0 * f);
    float nx00 = mix(n000, n100, u.x);
    float nx10 = mix(n010, n110, u.x);
    float nx01 = mix(n001, n101, u.x);
    float nx11 = mix(n011, n111, u.x);
    float nxy0 = mix(nx00, nx10, u.y);
    float nxy1 = mix(nx01, nx11, u.y);
    return mix(nxy0, nxy1, u.z);
}

float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
    }
    return v;
}

vec3 skyColor(float h, int mode) {
    if (mode == 5) return mix(vec3(0.02, 0.03, 0.08), vec3(0.01, 0.02, 0.05), h);
    if (mode == 3) return mix(vec3(0.15, 0.16, 0.2), vec3(0.05, 0.05, 0.08), h);
    if (mode == 2) return mix(vec3(0.35, 0.4, 0.5), vec3(0.1, 0.1, 0.15), h);
    if (mode == 4) return mix(vec3(0.85, 0.9, 1.0), vec3(0.6, 0.7, 0.9), h);
    if (mode == 1) return mix(vec3(0.6, 0.75, 1.0), vec3(0.3, 0.4, 0.7), h);
    return mix(vec3(0.55, 0.75, 1.0), vec3(0.2, 0.35, 0.7), h);
}

vec3 addSun(vec3 col, vec2 uv, float t, int mode, float sunIntensity) {
    float day = mod(t * 0.02, 1.0);
    float angle = day * 6.2831853;
    vec2 sunPos = vec2(
        0.5 + cos(angle) * 0.45,
        0.2 + sin(angle) * 0.35
    );
    if (mode == 5) return col;

    float d = distance(uv, sunPos);
    float core = smoothstep(0.05, 0.02, d);
    float halo = smoothstep(0.25, 0.05, d);
    float bloom = smoothstep(0.6, 0.2, d);

    vec3 sunColor = vec3(1.0, 0.96, 0.88) * sunIntensity;

    col += sunColor * core * 2.0;
    col += sunColor * halo * 0.6;
    col += sunColor * bloom * 0.3;

    return col;
}

float stars(vec2 uv, float t) {
    float s = 0.0;
    vec2 p = uv * 80.0;
    s += step(0.995, fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453));
    s += step(0.997, fract(sin(dot(p * 1.7, vec2(39.3467, 11.135))) * 24634.6345));
    return s;
}

float rain(vec2 uv, float t) {
    uv.y += t * 3.0;
    uv.x += sin(uv.y * 18.0) * 0.03;
    float n = fract(sin(dot(uv * vec2(40.0, 6.0), vec2(12.9898, 78.233))) * 43758.5453);
    return smoothstep(0.86, 1.0, n);
}

float lightningFlash(float t, float intensity) {
    float f = fract(t * 0.7);
    float flash = step(f, 0.02) + step(abs(f - 0.18), 0.02);
    return flash * intensity;
}

void main() {
    float t = uTime;
    float h = vUv.y;

    if (uResolution.x <= 0.0 || uResolution.y <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec3 col = skyColor(h, uMode);

    vec2 uv = (vUv - 0.5) * vec2(aspect, 1.0);
    vec3 ro = vec3(0.0, 0.0, -3.0);
    vec3 rd = normalize(vec3(uv, 1.8));

    vec3 wind = vec3(
        sin(t * 0.07 * uCloudSpeed + uSeed) * 0.4,
        cos(t * 0.05 * uCloudSpeed + uSeed * 1.3) * 0.2,
        0.3
    );

    float maxDist = 6.0;
    int steps = 14;
    float stepSize = maxDist / float(steps);

    float density = 0.0;
    vec3 p = ro;

    for (int i = 0; i < 14; i++) {
        float d = float(i) * stepSize;
        p = ro + rd * d;

        float height = clamp(p.y * 0.4 + 0.5, 0.0, 1.0);

        vec3 plow = p * 0.7 + wind * 0.5 + vec3(0.0, 0.0, uSeed);
        vec3 phigh = p * 1.4 + wind * 0.9 + vec3(0.0, 0.5, uSeed * 1.7);

        float nLow = fbm(plow);
        float nHigh = fbm(phigh);

        float lowLayer = smoothstep(0.45, 0.7, nLow) * uCloudLow;
        float highLayer = smoothstep(0.55, 0.8, nHigh) * uCloudHigh;

        float layer = lowLayer * (1.0 - height) + highLayer * height;

        float stepDensity = layer * 0.08;
        density += stepDensity;
    }

    density = clamp(density, 0.0, 1.4);

    vec3 cloudColor = vec3(1.0);
    if (uMode == 2 || uMode == 3) cloudColor = vec3(0.8, 0.82, 0.85);
    if (uMode == 5) cloudColor = vec3(0.6, 0.65, 0.7);

    vec3 cloudLight = mix(vec3(0.4, 0.45, 0.5), vec3(1.0), 0.6);
    vec3 clouds = mix(cloudLight, cloudColor, density);

    col = mix(col, clouds, clamp(density, 0.0, 1.0));

    col = addSun(col, vUv, t, uMode, uSunIntensity);

    if (uMode == 2) {
        float r = rain(vUv * vec2(1.0, 1.6), t);
        col = mix(col, vec3(0.7, 0.75, 0.8), r * 0.5);
    }

    if (uMode == 3) {
        float flash = lightningFlash(t, uLightning);
        col += vec3(0.9, 0.95, 1.0) * flash;
    }

    if (uMode == 5) {
        float s = stars(vUv, t);
        col += vec3(1.0, 0.98, 0.9) * s * 0.8;
    }

    col += vec3(aspect * 0.0008);

    gl_FragColor = vec4(col, 1.0);
}
