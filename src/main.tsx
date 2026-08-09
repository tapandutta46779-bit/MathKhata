import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { registerOfflineApp } from './offline';
import 'mathlive/static.css';
import './styles.css';

MathfieldElement.fontsDirectory = new URL(`${import.meta.env.BASE_URL}fonts/`, document.baseURI).href;
MathfieldElement.soundsDirectory = null;

if (window.mathKhataDesktop) {
  document.documentElement.dataset.desktopPlatform = window.mathKhataDesktop.platform;
  if (window.mathKhataDesktop.platform === 'darwin') {
    document.documentElement.style.setProperty('--desktop-titlebar-left', '82px');
  }
}

void registerOfflineApp();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
