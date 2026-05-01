precision mediump float;
varying vec2 vUv;

void main(){
  gl_FragColor = vec4(mix(vec3(0.5,0.7,1.0), vec3(0.2,0.3,0.5), vUv.y), 1.0);
}
