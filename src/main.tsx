import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import TechApp from './local/TechApp';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TechApp />
  </StrictMode>,
);