export const Lighting = {
  compute(mode, t) {
    let sun = 0.0;
    let lightning = 0.0;

    if (mode === 0) sun = 1.0;
    if (mode === 1) sun = 0.8;
    if (mode === 2) sun = 0.4;
    if (mode === 4) sun = 0.6;
    if (mode === 5) sun = 0.0;

    if (mode === 3) {
      const f = Math.sin(t * 7.0);
      lightning = f > 0.96 ? 1.0 : 0.0;
      sun = 0.2;
    }

    return { sun, lightning };
  }
};
