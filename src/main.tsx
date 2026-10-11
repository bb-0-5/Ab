import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import LocalApp from './local/LocalApp';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocalApp />
  </StrictMode>,
);