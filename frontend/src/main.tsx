import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SmoothScroll } from './components/SmoothScroll';
import 'lenis/dist/lenis.css';
import './styles.css';
import './trading-ui.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><SmoothScroll root><BrowserRouter><App /></BrowserRouter></SmoothScroll></React.StrictMode>,
);
