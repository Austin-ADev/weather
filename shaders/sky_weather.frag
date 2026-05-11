#ifdef GL_ES
precision mediump float;
#endif

uniform float uTime;
uniform vec2 uResolution;
uniform float uWeather;     // 0.0 = clear, 1.0 = overcast
uniform float uDayPhase;    // 0.0 = midnight, 0.5 = noon, 1.0 = next midnight

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    
    for (int i = 0; i < 8; i++) {
        if (i >= octaves) break;
        value += noise(p * frequency) * amplitude;
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

vec2 sunDir(float phase) {
    float a = (phase - 0.25) * 6.28318530718;
    return normalize(vec2(cos(a), sin(a)));
}

vec3 atmosphericScattering(vec3 dir, vec3 sunDir, float dayAmt) {
    float sunDot = max(dot(dir, sunDir), 0.0);
    // Rayleigh + Mie approximation
    vec3 sky = mix(vec3(0.4, 0.6, 1.0), vec3(0.05, 0.25, 0.8), dir.y * 0.5 + 0.5);
    sky += vec3(0.8, 0.6, 0.4) * pow(sunDot, 8.0) * 0.6 * dayAmt;           // warm horizon glow
    sky += vec3(1.0, 0.9, 0.7) * pow(sunDot, 32.0) * 1.5 * dayAmt;          // sun corona
    return sky;
}

void main() {
    vec2 uv = (gl_FragCoord.xy / uResolution.xy) * 2.0 - 1.0;
    uv.x *= uResolution.x / uResolution.y;
    
    float dayAmt = smoothstep(0.2, 0.45, uDayPhase) * (1.0 - smoothstep(0.55, 0.8, uDayPhase));
    float nightAmt = 1.0 - dayAmt;
    
    vec3 dir = normalize(vec3(uv, 1.0));  // fake "direction" for better gradients
    
    // === Sky Base ===
    vec3 skyColor = atmosphericScattering(dir, sunDir(uDayPhase), dayAmt);
    
    // Night sky
    vec3 nightSky = vec3(0.008, 0.01, 0.035) * (0.6 + 0.4 * dir.y);
    skyColor = mix(nightSky, skyColor, dayAmt);
    
    // === Sun ===
    vec2 sd = sunDir(uDayPhase);
    float sunDot = max(dot(normalize(vec2(uv)), sd), 0.0);
    
    vec3 sunColor = vec3(1.0, 0.96, 0.85);
    float sunHalo = pow(sunDot, 120.0) * 1.8;
    float sunCore = pow(sunDot, 800.0) * 3.0;
    
    skyColor += sunColor * sunHalo * dayAmt;
    skyColor += sunColor * sunCore * dayAmt;
    
    // Extra sun bloom / god rays feel
    skyColor += vec3(1.0, 0.7, 0.4) * pow(sunDot, 6.0) * 0.25 * dayAmt;
    
    // === Moon ===
    vec2 md = -sd;
    float moonDot = max(dot(normalize(vec2(uv)), md), 0.0);
    float moon = pow(moonDot, 1400.0);
    
    // Simple moon texture simulation
    float moonNoise = noise(uv * 25.0 + vec2(0.3)) * 0.15;
    vec3 moonCol = vec3(0.95, 0.97, 1.0) * (0.9 + moonNoise);
    
    skyColor += moonCol * moon * nightAmt * 1.6;
    
    // === Stars ===
    float starMask = nightAmt * (0.6 + 0.4 * dir.y);
    float stars = 0.0;
    
    vec2 starUV = uv * 4.5 + uTime * 0.005;
    for (int i = 0; i < 5; i++) {
        vec2 offset = vec2(float(i) * 1.7);
        float h = hash(starUV * 12.0 + offset);
        if (h > 0.995) {
            float twinkle = 0.9 + 0.1 * sin(uTime * 8.0 + h * 100.0);
            stars += smoothstep(0.0, 0.12, 0.12 - length(fract(starUV * 12.0 + offset) - 0.5)) * twinkle;
        }
    }
    skyColor += vec3(stars * 1.8) * starMask;
    
    // === Clouds ===
    float cloudTime = uTime * 0.015;
    vec2 cuv = uv * vec2(0.8, 0.45) + vec2(cloudTime * 0.3, cloudTime * 0.1);
    
    float cloud = 0.0;
    cloud += fbm(cuv * 1.2, 5) * 0.6;
    cloud += fbm(cuv * 2.7 + vec2(cloudTime * 0.8), 4) * 0.3;
    cloud += fbm(cuv * 5.5, 3) * 0.15;
    
    float cloudShape = smoothstep(0.35, 0.85, cloud);
    
    // Weather influence
    float cloudDensity = mix(0.1, 1.0, uWeather);
    cloudShape = min(cloudShape * cloudDensity, 1.0);
    
    // Cloud lighting
    vec3 cloudLit = mix(vec3(0.95, 0.97, 1.0), vec3(0.6, 0.65, 0.75), uWeather);
    
    // Sunlit clouds
    float cloudSunDot = max(dot(sd, normalize(vec3(uv * 0.6, 1.0))), 0.0);
    cloudLit = mix(cloudLit, vec3(1.0, 0.95, 0.8), pow(cloudSunDot, 3.0) * dayAmt * 0.7);
    
    skyColor = mix(skyColor, cloudLit, cloudShape * 0.92);
    
    // Very light haze on overcast
    skyColor = mix(skyColor, vec3(0.75, 0.78, 0.82), uWeather * 0.15 * (1.0 - dir.y * 0.5));
    
    // === Final touches ===
    col = pow(skyColor, vec3(0.95));           // gentle gamma
    col = col / (col + 0.15);                   // soft tonemapping (filmic feel)
    col = pow(col, vec3(0.95));                 // extra contrast
    
    gl_FragColor = vec4(col, 1.0);
}