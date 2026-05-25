// session.ts: Manages shared user authentication state and HTTP request helper signals.
// Dependencies: @angular/common/http, @angular/core, @angular/router, rxjs, ../environments/environment

import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, map, of, tap } from 'rxjs';
import { environment } from '../environments/environment';

export type Role = 'Admin' | 'General User';
export type Status = 'Active' | 'Pending' | 'Closed';

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  department: string;
  jobTitle: string;
  salary: number;
  active?: boolean;
  createdAt?: string;
}

export interface StaffRecord {
  id: string;
  title: string;
  description: string;
  status: Status;
  assignedTo: string;
  assignedToName: string;
  assignedAt: string;
  createdAt: string;
}

export const api = environment.apiUrl;
export const token = signal('');
export const auth = signal<User | null>(null);

export const clearAuth = (router?: Router) => {
  token.set('');
  auth.set(null);
  void router?.navigateByUrl('/login');
};

export const login = (http: HttpClient, username: string, password: string) => {
  const url = `${api}/auth/login${environment.delayMs ? `?delay=${environment.delayMs}` : ''}`;
  return http.post<{ token: string; user: User }>(url, { username, password }).pipe(
    tap((res) => {
      token.set(res.token);
      auth.set(res.user);
    })
  );
};

export const loadMe = (http: HttpClient) => {
  return http.get<{ user: User }>(`${api}/auth/me`).pipe(
    map((res) => res.user),
    tap((user) => auth.set(user)),
    catchError(() => of(null))
  );
};

export const logout = (http: HttpClient, router: Router) => {
  return http.post(`${api}/auth/logout`, {}).pipe(
    tap(() => clearAuth(router))
  );
};
