import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'dashboard',
    title: 'Dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'goals',
    title: 'Goals',
    loadComponent: () =>
      import('./features/goals/goals').then((m) => m.Goals),
  },
  {
    path: 'assets',
    title: 'Assets',
    loadComponent: () =>
      import('./features/assets/assets').then((m) => m.Assets),
  },
  {
    path: 'cashflow',
    title: 'Cash flow',
    loadComponent: () =>
      import('./features/cashflow/cashflow').then((m) => m.Cashflow),
  },
  {
    path: 'projections',
    title: 'Projections',
    loadComponent: () =>
      import('./features/projections/projections').then((m) => m.Projections),
  },
  {
    path: 'stock-sales',
    title: 'Stock sales',
    loadComponent: () =>
      import('./features/stock-sales/stock-sales').then((m) => m.StockSales),
  },
  {
    path: 'settings',
    title: 'Settings',
    loadComponent: () =>
      import('./features/settings/settings').then((m) => m.Settings),
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
