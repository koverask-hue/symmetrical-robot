// Runs the computer opponent's planning off the main thread so the table keeps animating.
import { planShot } from './ai.js';

self.onmessage = (e) => {
  const { id, balls, game, level, seed } = e.data;
  let shot = null;
  try {
    shot = planShot(balls, game, level, seed);
  } catch (err) {
    console.error(err);
  }
  self.postMessage({ id, shot });
};
