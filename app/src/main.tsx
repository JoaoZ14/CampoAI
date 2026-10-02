import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import ErrorBoundary from './ErrorBoundary';

createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><React.Suspense fallback={<div className="boot" role="status">Abrindo o AGGI…</div>}><App /></React.Suspense></ErrorBoundary></React.StrictMode>);
