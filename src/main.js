import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/baloo-2/latin-600.css';
import '@fontsource/baloo-2/latin-800.css';
import './ui/ui.css';
import { App } from './game/app.js';

// Keep the page from scrolling or zooming inside the iframe.
window.addEventListener('keydown', (e) => {
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
});
document.addEventListener('gesturestart', (e) => e.preventDefault());
window.focus();

const bootEl = document.getElementById('boot');
const bar = bootEl.querySelector('i');
const lab = bootEl.querySelector('.lab');
let shown = 0;
const progress = (p, msg) => {
  shown = Math.max(shown, p);
  bar.style.width = `${shown}%`;
  lab.textContent = `${msg}... ${Math.round(shown)}%`;
};

const app = new App(document.getElementById('game'));
window.__app = app;
app.boot(progress).then(() => {
  bootEl.classList.add('gone');
  setTimeout(() => bootEl.remove(), 450);
}).catch((err) => {
  console.error(err);
  lab.textContent = 'This game needs WebGL 2. Please try another browser.';
});
