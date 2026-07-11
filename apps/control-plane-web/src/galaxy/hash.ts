/** Deterministic string hash to a unit float — stable star spawn points and
 *  pulse phases across rebuilds, where Math.random would make the sky flicker. */
export const hashUnit = (seed: string, salt = 0): number => {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return (h >>> 0) / 4294967296;
};
