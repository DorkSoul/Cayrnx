import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/fira-code/400.css';
import '@xterm/xterm/css/xterm.css';
import './styles/tokens.css';
import './styles/prototype.css';
import './styles/app.css';
import './styles/mobile.css';
import { App } from './App.tsx';
import { ignorePasswordManagers } from './nofill.ts';
import { paletteCss } from './themes.ts';

ignorePasswordManagers();

// Every colour theme's tokens, scoped by the root's data-palette (Settings → Appearance).
const paletteStyle = document.createElement('style');
paletteStyle.id = 'cx-palettes';
paletteStyle.textContent = paletteCss();
document.head.appendChild(paletteStyle);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
