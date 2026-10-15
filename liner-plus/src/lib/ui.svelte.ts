import type { Track } from './sources/types';

export interface MenuState {
  x: number;
  y: number;
  track: Track;
  /** Set when the menu was opened from a local playlist, to offer "Remove". */
  playlistId?: string;
}

class UI {
  lyricsOpen = $state(false);
  queueOpen = $state(false);
  paletteOpen = $state(false);
  helpOpen = $state(false);
  settingsOpen = $state(false);
  menu = $state<MenuState | null>(null);

  openMenu(e: MouseEvent, track: Track, playlistId?: string) {
    e.preventDefault();
    e.stopPropagation();
    this.menu = { x: e.clientX, y: e.clientY, track, playlistId };
  }

  closeAll() {
    if (this.menu) return void (this.menu = null);
    if (this.paletteOpen) return void (this.paletteOpen = false);
    if (this.helpOpen) return void (this.helpOpen = false);
    if (this.settingsOpen) return void (this.settingsOpen = false);
    if (this.queueOpen) return void (this.queueOpen = false);
    if (this.lyricsOpen) return void (this.lyricsOpen = false);
  }
}

export const ui = new UI();
