import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { initializePwa } from './services/pwa';
initializePwa();
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
