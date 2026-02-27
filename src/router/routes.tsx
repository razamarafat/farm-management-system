import { RouteObject, Navigate } from 'react-router-dom';

import { AppLayout } from '@/components/layout/AppLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';

import LoginPage from '@/pages/LoginPage';
import AdminPage from '@/pages/AdminPage';
import SupervisorPage from '@/pages/SupervisorPage';
import OperatorPage from '@/pages/OperatorPage';
import AdminUsersPage from '@/pages/AdminUsersPage';
import AdminFarmsPage from '@/pages/AdminFarmsPage';
import NotFoundPage from '@/pages/NotFoundPage';
import UnderDevelopment from '@/components/shared/UnderDevelopment';
import ConsumptionPage from '@/pages/ConsumptionPage';
import DailySheetPage from '@/pages/DailySheetPage';
import FormulaManagementPage from '@/pages/FormulaManagementPage';
import InventoryPage from '@/pages/InventoryPage';
import InventoryItemHistoryPage from '@/pages/InventoryItemHistoryPage';
import ReorderPointPage from '@/pages/ReorderPointPage';
import PurchasesPage from '@/pages/PurchasesPage';
import SuppliersPage from '@/pages/SuppliersPage';
import ReportsPage from '@/pages/ReportsPage';

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
            element: <AdminPage />,
          },
          {
            path: 'users',
            element: <AdminUsersPage />,
          },
          {
            path: 'farms',
            element: <AdminFarmsPage />,
          },
          {
            path: 'consumption',
            element: <ConsumptionPage />,
          },
          {
            path: 'consumption/feed',
            element: <DailySheetPage category="feed" />,
          },
          {
            path: 'consumption/packaging',
            element: <DailySheetPage category="packaging" />,
          },
          {
            path: 'formulas',
            element: <FormulaManagementPage />,
          },
          {
            path: 'inventory',
            element: <InventoryPage />,
          },
          {
            path: 'inventory/items/:itemId',
            element: <InventoryItemHistoryPage />,
          },
          {
            path: 'inventory/reorder-points',
            element: <ReorderPointPage />,
          },
          {
            path: 'purchases',
            element: <PurchasesPage />,
          },
          {
            path: 'suppliers',
            element: <SuppliersPage />,
          },
          {
            path: 'reports',
            element: <ReportsPage />,
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
            element: <SupervisorPage />,
          },
          {
            path: 'consumption',
            element: <ConsumptionPage />,
          },
          {
            path: 'consumption/feed',
            element: <DailySheetPage category="feed" />,
          },
          {
            path: 'consumption/packaging',
            element: <DailySheetPage category="packaging" />,
          },
          {
            path: 'formulas',
            element: <FormulaManagementPage />,
          },
          {
            path: 'inventory',
            element: <InventoryPage />,
          },
          {
            path: 'inventory/items/:itemId',
            element: <InventoryItemHistoryPage />,
          },
          {
            path: 'inventory/reorder-points',
            element: <ReorderPointPage />,
          },
          {
            path: 'purchases',
            element: <PurchasesPage />,
          },
          {
            path: 'reports',
            element: <ReportsPage />,
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
            element: <OperatorPage />,
          },
          {
            path: 'consumption',
            element: <ConsumptionPage />,
          },
          {
            path: 'consumption/feed',
            element: <DailySheetPage category="feed" />,
          },
          {
            path: 'consumption/packaging',
            element: <DailySheetPage category="packaging" />,
          },
          {
            path: 'formulas',
            element: <FormulaManagementPage />,
          },
          {
            path: 'inventory',
            element: <InventoryPage />,
          },
          {
            path: 'inventory/items/:itemId',
            element: <InventoryItemHistoryPage />,
          },
          {
            path: 'inventory/reorder-points',
            element: <ReorderPointPage />,
          },
          {
            path: 'purchases',
            element: <PurchasesPage />,
          },
          {
            path: 'reports',
            element: <ReportsPage />,
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
