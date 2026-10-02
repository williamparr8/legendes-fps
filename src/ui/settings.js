import { MOVE } from '../player/config.js';
import { setVolume } from '../core/audio.js';

const KEY = 'legendes-fps-settings';
export const settings = { sens: 1, fov: 90, volume: 0.7, name: '' };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* stockage indisponible */ }

export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignoré */ } }

export function applySettings(input) {
  input.sens = 0.0022 * settings.sens;
  MOVE.fov = settings.fov; MOVE.fovSprint = settings.fov + 6; MOVE.fovSlide = settings.fov + 10;
  setVolume(settings.volume);
}
