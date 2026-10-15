// Global keyboard shortcuts. Ignored while typing in a field.

import { library } from './library.svelte';
import { player } from './player/player.svelte';
import { router } from './router.svelte';
import { ui } from './ui.svelte';

function typing(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

export function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    ui.paletteOpen = !ui.paletteOpen;
    return;
  }
  if (e.key === 'Escape') return ui.closeAll();
  if (typing(e) || ui.paletteOpen) return;
  if (e.altKey && e.key === 'ArrowLeft') return router.back();
  if (e.altKey && e.key === 'ArrowRight') return router.forward();
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const t = player.current;
  const handled = (() => {
    switch (e.key) {
      case ' ':
        // Let focused buttons handle their own space press.
        if ((e.target as HTMLElement)?.tagName === 'BUTTON') return false;
        player.toggle();
        return true;
      case 'ArrowRight':
        if (e.shiftKey) player.next();
        else player.seekBy(5);
        return true;
      case 'ArrowLeft':
        if (e.shiftKey) player.prev();
        else player.seekBy(-5);
        return true;
      case 'ArrowUp':
        player.setVolume(player.volume + 0.05);
        return true;
      case 'ArrowDown':
        player.setVolume(player.volume - 0.05);
        return true;
      case 'm':
      case 'M':
        player.toggleMute();
        return true;
      case 'l':
      case 'L':
        ui.lyricsOpen = !ui.lyricsOpen;
        return true;
      case 'q':
      case 'Q':
        ui.queueOpen = !ui.queueOpen;
        return true;
      case 's':
      case 'S':
        player.toggleShuffle();
        return true;
      case 'r':
      case 'R':
        player.cycleRepeat();
        return true;
      case 'f':
      case 'F':
        if (t) library.toggleLike(t);
        return true;
      case '[':
        if (t) library.nudgeOffset(t.id, -0.1);
        return true;
      case ']':
        if (t) library.nudgeOffset(t.id, 0.1);
        return true;
      case '/':
        ui.paletteOpen = true;
        return true;
      case '?':
        ui.helpOpen = !ui.helpOpen;
        return true;
    }
    return false;
  })();
  if (handled) e.preventDefault();
}
