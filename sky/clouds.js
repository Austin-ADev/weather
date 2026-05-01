export const Clouds = {
  compute(mode, t){
    switch(mode){
      case 0: return { low:0.2, high:0.1 }; // clear
      case 1: return { low:0.6, high:0.4 }; // partly
      case 2: return { low:1.0, high:0.5 }; // rain
      case 3: return { low:1.4, high:0.7 }; // storm
      case 4: return { low:0.9, high:0.6 }; // snow
      case 5: return { low:0.3, high:0.2 }; // night
    }
    return { low:0.5, high:0.3 };
  }
};
