import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { initializePwa } from './services/pwa';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
initializePwa();
createRoot(document.getElementById('root')!).render(<StrictMode><App/><PwaUpdatePrompt/></StrictMode>);
