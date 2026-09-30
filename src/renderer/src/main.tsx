import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AgentProvider } from './agent/AgentProvider';
import { ApiProvider } from './api';
import { App } from './App';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <ApiProvider api={window.datadesk}>
      <AgentProvider>
        <App />
      </AgentProvider>
    </ApiProvider>
  </StrictMode>,
);
