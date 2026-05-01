export const Lighting = {
  compute(mode, t){
    let sun = 0.0;
    let lightning = 0.0;

    if(mode === 0) sun = 1.0;
    if(mode === 1) sun = 0.7;
    if(mode === 4) sun = 0.5;

    if(mode === 3){
      lightning = (Math.sin(t*7.0) > 0.95) ? 1.0 : 0.0;
    }

    return { sun, lightning };
  }
};
