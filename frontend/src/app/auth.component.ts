// auth.component.ts: Handles user login credentials, authentication form state, validation, and error display.
// Dependencies: @angular/common, @angular/common/http, @angular/core, @angular/router, rxjs, ./session

import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { login } from './session';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <section class="auth page-container">
      <div class="hero">
        <p class="brand-tagline">MPLOYCHEK</p>
        <h1 class="brand-title">Staff Portal</h1>
        <span class="brand-desc">
          Internal operations, staff visibility, and task tracking in one clean workspace.
        </span>
      </div>
      <form class="auth-card" [formGroup]="form" (ngSubmit)="submit()">
        <h2 class="card-title">Sign In</h2>
        <span class="card-subtitle">Use your staff credentials to continue.</span>
        @if (error()) {
          <div class="error-banner">{{ error() }}</div>
        }
        <label class="form-label">
          <span>Email</span>
          <input formControlName="username" autocomplete="email" class="input-field" />
        </label>
        <label class="form-label">
          <span>Password</span>
          <input type="password" formControlName="password" autocomplete="current-password" class="input-field" />
        </label>
        <button [disabled]="busy()" class="btn-primary auth-submit-btn">
          {{ busy() ? 'Signing in...' : 'Login' }}
        </button>
      </form>
    </section>
  `,
  styles: [`
    .auth {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 2rem;
      padding: 4rem;
    }
    .hero, .auth-card {
      display: grid;
    }
    .hero {
      align-content: center;
      gap: 1rem;
    }
    .brand-tagline {
      margin: 0;
      color: var(--color-orange-600);
      font-weight: 800;
      letter-spacing: 0.18em;
    }
    .brand-title {
      margin: 0;
      font-size: 4rem;
      line-height: 0.95;
    }
    .brand-desc {
      max-width: 34rem;
      color: var(--color-slate-600);
      font-size: 1.2rem;
      line-height: 1.8;
    }
    .auth-card {
      gap: 1rem;
      align-content: center;
      max-width: 30rem;
      padding: 2rem;
      border: 1px solid var(--color-border);
      border-radius: 2rem;
      background: rgba(255, 255, 255, 0.88);
      box-shadow: var(--shadow-lg);
    }
    .card-title, .card-subtitle {
      margin: 0;
    }
    .card-subtitle, .form-label span {
      color: var(--color-slate-500);
    }
    .form-label {
      display: grid;
      gap: 0.45rem;
    }
    .error-banner {
      padding: 0.9rem 1rem;
      border-radius: 1rem;
      background: #fee2e2;
      color: #b91c1c;
      font-size: 0.95rem;
    }
    @media (max-width: 900px) {
      .auth {
        grid-template-columns: 1fr;
        padding: 1.25rem;
      }
      .brand-title {
        font-size: 3rem;
      }
    }
  `]
})
export class AuthComponent {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly busy = signal(false);
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  submit() {
    if (this.form.invalid) {
      return this.form.markAllAsTouched();
    }
    this.busy.set(true);
    this.error.set('');
    login(this.http, this.form.getRawValue().username, this.form.getRawValue().password)
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => void this.router.navigateByUrl('/dashboard'),
        error: () => this.error.set('Login failed. Check your credentials and retry.')
      });
  }
}
