import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './accessibility.css';
import ErrorBoundary from './ErrorBoundary';
import { createBrowserRouter, createHashRouter, RouterProvider } from 'react-router-dom';
import './pages.css';

const routes = [{ path: '*', element: <App /> }];
const router = import.meta.env.MODE === 'native' ? createHashRouter(routes) : createBrowserRouter(routes);
createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><React.Suspense fallback={<div className="boot" role="status">Abrindo o AGGI…</div>}><RouterProvider router={router}/></React.Suspense></ErrorBoundary></React.StrictMode>);
