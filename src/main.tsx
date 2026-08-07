import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import App from './App';
import './styles.css';

MathfieldElement.fontsDirectory = '/fonts';
MathfieldElement.soundsDirectory = null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

