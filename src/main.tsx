import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fortawesome/fontawesome-free/css/all.min.css'
import '@fontsource/noto-sans-jp/japanese-400.css'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './i18n.tsx'


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
