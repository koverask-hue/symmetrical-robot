// Module worker wrapping the fallback searcher so a deep search never freezes the 3D scene.
import { chooseMove } from './fallback-ai.js';

self.onmessage = (e) => {
  const { id, fen, options } = e.data;
  let move = null;
  try {
    move = chooseMove(fen, options);
  } catch (err) {
    console.error(err);
  }
  self.postMessage({ id, move });
};
