precision mediump float;

varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;
uniform int uMode;
uniform int uQuality;

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float noise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    float a=hash(i);
    float b=hash(i+vec2(1,0));
    float c=hash(i+vec2(0,1));
    float d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.0-2.0*f);
    return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
}

float fbm(vec2 p){
    float v=0.0;
    float a=0.5;
    for(int i=0;i<7;i++){
        v+=a*noise(p);
        p*=2.0;
        a*=0.5;
    }
    return v;
}

vec3 sky(float h){
    return mix(vec3(0.55,0.7,1.0), vec3(0.1,0.2,0.4), h);
}

void main(){
    float h=vUv.y;
    vec3 col=sky(h);

    // fake volumetric cloud layers
    float t=uTime*0.03;
    float c1=fbm(vUv*3.0 + vec2(t,0.0));
    float c2=fbm(vUv*5.0 + vec2(0.0,t*0.7));
    float cloud = smoothstep(0.55,0.8,(c1*0.6 + c2*0.4));

    col = mix(col, vec3(1.0), cloud*0.7);

    gl_FragColor=vec4(col,1.0);
}
