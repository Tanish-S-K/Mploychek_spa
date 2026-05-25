// main.ts: Bootstraps the Angular application, configures the router with authentication guards, and registers Http Interceptors.
// Dependencies: @angular/common/http, @angular/platform-browser, @angular/core, @angular/router, rxjs, ./app/app.component, ./app/auth.component, ./app/portal.component, ./app/session

import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { catchError, map, of, tap } from 'rxjs';
import { AppComponent } from './app/app.component';
import { AuthComponent } from './app/auth.component';
import { PortalComponent } from './app/portal.component';
import { auth, clearAuth, loadMe, token } from './app/session';

const requireAuth = () => {
  const http = inject(HttpClient);
  const router = inject(Router);
  return auth()
    ? true
    : loadMe(http).pipe(
        map(Boolean),
        tap((ok) => !ok && router.navigateByUrl('/login'))
      );
};

const requireAdmin = () => {
  const http = inject(HttpClient);
  const router = inject(Router);
  return auth()?.role === 'Admin'
    ? true
    : loadMe(http).pipe(
        map((user) => user?.role === 'Admin'),
        tap((ok) => !ok && router.navigateByUrl('/dashboard')),
        catchError(() => {
          clearAuth(router);
          return of(false);
        })
      );
};

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(
      withInterceptors([
        (req, next) => {
          const headers: Record<string, string> = token()
            ? { Authorization: `Bearer ${token()}` }
            : {};
          return next(req.clone({ withCredentials: true, setHeaders: headers }));
        }
      ])
    ),
    provideRouter([
      { path: 'login', component: AuthComponent },
      {
        path: '',
        canActivate: [requireAuth],
        children: [
          { path: 'dashboard', component: PortalComponent },
          { path: 'admin', component: PortalComponent, canActivate: [requireAdmin] },
          { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
        ]
      },
      { path: '**', redirectTo: 'dashboard' }
    ])
  ]
}).catch((err) => console.error(err));
