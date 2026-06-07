import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App.tsx';
import './styles/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root');

// Under the packaged Electron build (app:// custom protocol, or file:// in
// older builds) BrowserRouter can't navigate — pathname routing has no server
// to serve index.html for deep links. HashRouter keeps all routes in the URL
// fragment, which both protocols handle fine. Dev/web keep BrowserRouter for
// clean URLs.
const Router = /^(file|app):$/.test(window.location.protocol)
  ? HashRouter
  : BrowserRouter;

createRoot(rootEl).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
