import { SummerGameApp } from './app.js';

window.addEventListener('DOMContentLoaded', async () => {
  const app = new SummerGameApp(document.getElementById('summerApp'));
  window.__summerGame = app;
  await app.init();
});

