import { RouteObject, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';

import { AppLayout } from '@/components/layout/AppLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { Spinner } from '@/components/ui/Spinner';

// Eagerly loaded critical pages
import LoginPage from '@/pages/LoginPage';
import NotFoundPage from '@/pages/NotFoundPage';
import UnderDevelopment from '@/components/shared/UnderDevelopment';

// Lazy-loaded pages for code splitting
const AdminPage = lazy(() => import('@/pages/AdminPage'));
const SupervisorPage = lazy(() => import('@/pages/SupervisorPage'));
const OperatorPage = lazy(() => import('@/pages/OperatorPage'));
const AdminUsersPage = lazy(() => import('@/pages/AdminUsersPage'));
const AdminFarmsPage = lazy(() => import('@/pages/AdminFarmsPage'));
const ConsumptionPage = lazy(() => import('@/pages/ConsumptionPage'));
const DailySheetPage = lazy(() => import('@/pages/DailySheetPage'));
const FormulaManagementPage = lazy(() => import('@/pages/FormulaManagementPage'));
const InventoryPage = lazy(() => import('@/pages/InventoryPage'));
const PurchasesPage = lazy(() => import('@/pages/PurchasesPage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const ReorderPointPage = lazy(() => import('@/pages/ReorderPointPage'));
const SuppliersPage = lazy(() => import('@/pages/SuppliersPage'));
const InventoryItemHistoryPage = lazy(() => import('@/pages/InventoryItemHistoryPage'));
const InputsPage = lazy(() => import('@/pages/InputsPage'));

function LazyPage({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Spinner size={32} /></div>}>
      {children}
    </Suspense>
  );
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Navigate to="/login" replace />,
  },
  {
    path: '/login',
    element: <AuthLayout />,
    children: [
      {
        index: true,
        element: <LoginPage />,
      },
    ],
  },
  {
    path: '/admin',
    element: <ProtectedRoute allowedRoles={['admin']} />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <LazyPage><AdminPage /></LazyPage>,
          },
          {
            path: 'users',
            element: <LazyPage><AdminUsersPage /></LazyPage>,
          },
          {
            path: 'farms',
            element: <LazyPage><AdminFarmsPage /></LazyPage>,
          },
          {
            path: 'consumption',
            element: <LazyPage><ConsumptionPage /></LazyPage>,
          },
          {
            path: 'consumption/feed',
            element: <LazyPage><DailySheetPage category="feed" /></LazyPage>,
          },
          {
            path: 'consumption/packaging',
            element: <LazyPage><DailySheetPage category="packaging" /></LazyPage>,
          },
          {
            path: 'formulas',
            element: <LazyPage><FormulaManagementPage /></LazyPage>,
          },
          {
            path: 'inventory',
            element: <LazyPage><InventoryPage /></LazyPage>,
          },
          {
            path: 'inventory/:itemId/history',
            element: <LazyPage><InventoryItemHistoryPage /></LazyPage>,
          },
          {
            path: 'purchase',
            element: <LazyPage><PurchasesPage /></LazyPage>,
          },
          {
            path: 'reports',
            element: <LazyPage><ReportsPage /></LazyPage>,
          },
          {
            path: 'reorder',
            element: <LazyPage><ReorderPointPage /></LazyPage>,
          },
          {
            path: 'suppliers',
            element: <LazyPage><SuppliersPage /></LazyPage>,
          },
          {
            path: 'inputs',
            element: <LazyPage><InputsPage /></LazyPage>,
          },
          {
            path: '*',
            element: <UnderDevelopment />,
          },
        ],
      },
    ],
  },
  {
    path: '/supervisor',
    element: <ProtectedRoute allowedRoles={['supervisor']} />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <LazyPage><SupervisorPage /></LazyPage>,
          },
          {
            path: 'consumption',
            element: <LazyPage><ConsumptionPage /></LazyPage>,
          },
          {
            path: 'consumption/feed',
            element: <LazyPage><DailySheetPage category="feed" /></LazyPage>,
          },
          {
            path: 'consumption/packaging',
            element: <LazyPage><DailySheetPage category="packaging" /></LazyPage>,
          },
          {
            path: 'formulas',
            element: <LazyPage><FormulaManagementPage /></LazyPage>,
          },
          {
            path: 'inventory',
            element: <LazyPage><InventoryPage /></LazyPage>,
          },
          {
            path: 'inventory/:itemId/history',
            element: <LazyPage><InventoryItemHistoryPage /></LazyPage>,
          },
          {
            path: 'purchase',
            element: <LazyPage><PurchasesPage /></LazyPage>,
          },
          {
            path: 'reports',
            element: <LazyPage><ReportsPage /></LazyPage>,
          },
          {
            path: 'reorder',
            element: <LazyPage><ReorderPointPage /></LazyPage>,
          },
          {
            path: '*',
            element: <UnderDevelopment />,
          },
        ],
      },
    ],
  },
  {
    path: '/operator',
    element: <ProtectedRoute allowedRoles={['operator']} />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <LazyPage><OperatorPage /></LazyPage>,
          },
          {
            path: 'consumption',
            element: <LazyPage><ConsumptionPage /></LazyPage>,
          },
          {
            path: 'consumption/feed',
            element: <LazyPage><DailySheetPage category="feed" /></LazyPage>,
          },
          {
            path: 'consumption/packaging',
            element: <LazyPage><DailySheetPage category="packaging" /></LazyPage>,
          },
          {
            path: 'formulas',
            element: <LazyPage><FormulaManagementPage /></LazyPage>,
          },
          {
            path: 'inventory',
            element: <LazyPage><InventoryPage /></LazyPage>,
          },
          {
            path: 'inventory/:itemId/history',
            element: <LazyPage><InventoryItemHistoryPage /></LazyPage>,
          },
          {
            path: 'purchase',
            element: <LazyPage><PurchasesPage /></LazyPage>,
          },
          {
            path: 'reports',
            element: <LazyPage><ReportsPage /></LazyPage>,
          },
          {
            path: 'reorder',
            element: <LazyPage><ReorderPointPage /></LazyPage>,
          },
          {
            path: '*',
            element: <UnderDevelopment />,
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
];
