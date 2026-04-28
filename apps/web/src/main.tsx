import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';

// IBM Carbon global styles — must be imported before any component styles
import '@carbon/styles/css/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
