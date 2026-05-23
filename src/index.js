import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
import { CurrencyProvider } from './CurrencyContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <CurrencyProvider>
    <App />
  </CurrencyProvider>
);