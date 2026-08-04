import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './app/App';
import './styles/global.css';

// HashRouter — найнадійніший для статичного хостингу (GitHub Pages): вкладені
// маршрути (напр. #/settings/categories) не повертають 404 після перезавантаження,
// і не потрібен окремий 404.html fallback. Ассети адресуються через BASE_URL.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
