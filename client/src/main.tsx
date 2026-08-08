import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { registerServiceWorker } from './pwa';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('The root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
