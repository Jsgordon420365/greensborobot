import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { logger } from './lib/logger';
import { registerServiceWorker } from './lib/registerSW';
import './styles/global.css';

logger.info('app.init', 'Nagimals starting', {
  href: typeof location !== 'undefined' ? location.pathname : 'unknown',
});

const container = document.getElementById('root');
if (!container) throw new Error('The #root element is missing from index.html.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void registerServiceWorker();
