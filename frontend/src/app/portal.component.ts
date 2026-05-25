// portal.component.ts: Dashboard workspace for MPloyChek staff, exposing profile information, assistant utilities, records tracking, and administrative user controls.
// Dependencies: @angular/common, @angular/common/http, @angular/core, @angular/forms, @angular/router, rxjs, ./session

import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { debounceTime, finalize, forkJoin, of } from 'rxjs';
import { api, auth, loadMe, logout, StaffRecord, User } from './session';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe, CurrencyPipe],
  template: `
    <section class="page page-container">
      <header class="topbar">
        <div class="brand">
          <b>MC</b>
          <div>
            <strong>MPloyChek Staff Portal</strong>
            <span>{{ me()?.department }} / {{ me()?.jobTitle }}</span>
          </div>
        </div>
        <div class="topbar__right">
          <span class="pill">{{ me()?.role }}</span>
          <button class="logout" (click)="signOut()">Logout</button>
        </div>
      </header>

      @if (loading()) {
        <div class="grid">
          <div class="card-panel skeleton"></div>
          <div class="card-panel skeleton big"></div>
        </div>
      } @else {
        <div class="grid">
          <section class="hero card-panel">
            <div class="hero__head">
              <div class="avatar">{{ initials() }}</div>
              <div>
                <h1>{{ me()?.name }}</h1>
                <p>{{ me()?.username }}</p>
              </div>
            </div>
            <div class="chips">
              <span>{{ me()?.department }}</span>
              <span>{{ me()?.jobTitle }}</span>
              <span>{{ me()?.salary | currency:'USD':'symbol':'1.0-0' }}</span>
            </div>
            <div class="stats">
              <article>
                <small>Visible</small>
                <strong>{{ filteredRecords().length }}</strong>
              </article>
              <article>
                <small>Active</small>
                <strong>{{ count('Active') }}</strong>
              </article>
              <article>
                <small>Pending</small>
                <strong>{{ count('Pending') }}</strong>
              </article>
              <article>
                <small>Closed</small>
                <strong>{{ count('Closed') }}</strong>
              </article>
            </div>
          </section>

          <section class="card-panel assistant">
            <div class="assistant__head">
              <div>
                <h2>{{ isAdmin() ? 'Admin Assistant' : 'My Assistant' }}</h2>
                <span>
                  {{ isAdmin() 
                    ? 'Ask about any user, salary, department, or task.' 
                    : 'Ask about your own profile and tasks.' 
                  }}
                </span>
              </div>
              <button class="btn-ghost" (click)="question.setValue(prompts()[0])">
                Use prompt
              </button>
            </div>
            <div class="chips">
              @for (x of prompts(); track x) {
                <button class="btn-ghost" (click)="question.setValue(x)">
                  {{ x }}
                </button>
              }
            </div>
            <label class="area">
              <textarea 
                [formControl]="question" 
                rows="4" 
                placeholder="Ask something useful..." 
                class="input-field"
              ></textarea>
            </label>
            <button 
              class="ask btn-primary" 
              [disabled]="thinking() || !question.value.trim()" 
              (click)="ask()"
            >
              {{ thinking() ? 'Thinking...' : 'Ask assistant' }}
            </button>
            @if (answer()) {
              <div class="answer">{{ answer() }}</div>
            }
          </section>

          <section class="card-panel table">
            <div class="table__head">
              <div>
                <h2>Records</h2>
                <span>{{ filteredRecords().length }} of {{ records().length }} shown</span>
              </div>
              <label class="search">
                <span>🔎</span>
                <input [formControl]="recordSearch" placeholder="Search records" />
                @if (recordSearch.value) {
                  <button (click)="recordSearch.setValue('')">×</button>
                }
              </label>
            </div>
            <div class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Assigned</th>
                    <th>User</th>
                  </tr>
                </thead>
                <tbody>
                  @for (x of filteredRecords(); track x.id; let i = $index) {
                    <tr>
                      <td>{{ i + 1 }}</td>
                      <td>
                        <strong>{{ x.title }}</strong>
                        <small>{{ x.description }}</small>
                      </td>
                      <td>
                        @if (isAdmin()) {
                          <select (change)="setStatus(x, $any($event.target).value)">
                            @for (s of statuses; track s) {
                              <option [value]="s" [selected]="s === x.status">{{ s }}</option>
                            }
                          </select>
                        } @else {
                          <span class="status" [class]="x.status.toLowerCase()">
                            {{ x.status }}
                          </span>
                        }
                      </td>
                      <td>{{ x.assignedAt | date:'mediumDate' }}</td>
                      <td>{{ x.assignedToName }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          @if (isAdmin()) {
            <section class="card-panel admin">
              <div class="table__head">
                <div>
                  <h2>Users</h2>
                  <span>{{ filteredUsers().length }} of {{ users().length }} shown</span>
                </div>
                <div class="row">
                  <label class="search">
                    <span>🔎</span>
                    <input [formControl]="userSearch" placeholder="Search users" />
                    @if (userSearch.value) {
                      <button (click)="userSearch.setValue('')">×</button>
                    }
                  </label>
                  <button class="btn-primary" (click)="edit()">Add User</button>
                </div>
              </div>

              @if (editing()) {
                <form class="user-form" [formGroup]="userForm" (ngSubmit)="saveUser()">
                  <input formControlName="name" placeholder="Full name" class="input-field" />
                  <input formControlName="username" placeholder="Email" class="input-field" />
                  <input formControlName="password" placeholder="Password" class="input-field" />
                  <select formControlName="role" class="input-field">
                    <option>Admin</option>
                    <option>General User</option>
                  </select>
                  <select formControlName="department" class="input-field">
                    @for (x of departments; track x) {
                      <option [value]="x">{{ x }}</option>
                    }
                  </select>
                  <select formControlName="jobTitle" class="input-field">
                    @for (x of jobs; track x) {
                      <option [value]="x">{{ x }}</option>
                    }
                  </select>
                  <input type="number" formControlName="salary" placeholder="Salary" class="input-field" />
                  <label class="toggle">
                    <input type="checkbox" formControlName="active" /> Active
                  </label>
                  <div class="row">
                    <button class="btn-primary">
                      {{ editing() === 'new' ? 'Create' : 'Save' }}
                    </button>
                    <button type="button" class="btn-ghost" (click)="editing.set('')">
                      Cancel
                    </button>
                  </div>
                </form>
              }

              <div class="table-wrapper">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Department</th>
                      <th>Role</th>
                      <th>Salary</th>
                      <th>Access</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (x of filteredUsers(); track x.id) {
                      <tr [class.active-row]="selectedUserId() === x.id">
                        <td>
                          <strong>{{ x.name }}</strong>
                          <small>{{ x.username }}</small>
                        </td>
                        <td>{{ x.department }}</td>
                        <td>{{ x.jobTitle }}</td>
                        <td>{{ x.salary | currency:'USD':'symbol':'1.0-0' }}</td>
                        <td>{{ x.role }} / {{ x.active ? 'Active' : 'Inactive' }}</td>
                        <td class="actions">
                          <button class="btn-ghost" (click)="pickUser(x)">View Tasks</button>
                          <button class="btn-ghost" (click)="edit(x)">Edit</button>
                          <button class="btn-ghost danger" (click)="deactivate(x)">Deactivate</button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>

            @if (selectedUser()) {
              <section class="card-panel table">
                <div class="table__head">
                  <div>
                    <h2>{{ selectedUser()?.name }} — Tasks</h2>
                    <span>{{ selectedRecords().length }} assigned records</span>
                  </div>
                  <button class="btn-primary" (click)="editTask()">Add Task</button>
                </div>

                @if (editingTask()) {
                  <form class="user-form" [formGroup]="taskForm" (ngSubmit)="saveTask()">
                    <input formControlName="title" placeholder="Task Title" class="input-field" />
                    <input formControlName="description" placeholder="Description" class="input-field" />
                    <select formControlName="status" class="input-field">
                      @for (s of statuses; track s) {
                        <option [value]="s">{{ s }}</option>
                      }
                    </select>
                    <select formControlName="assignedTo" class="input-field">
                      @for (u of users(); track u.id) {
                        <option [value]="u.id">{{ u.name }}</option>
                      }
                    </select>
                    <div class="row" style="grid-column: 1 / -1; margin-top: 0.5rem">
                      <button class="btn-primary">
                        {{ editingTask() === 'new' ? 'Create' : 'Save' }}
                      </button>
                      <button type="button" class="btn-ghost" (click)="editingTask.set('')">
                        Cancel
                      </button>
                    </div>
                  </form>
                }

                <div class="table-wrapper">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Status</th>
                        <th>Assigned</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (x of selectedRecords(); track x.id) {
                        <tr>
                          <td>
                            <strong>{{ x.title }}</strong>
                            <small>{{ x.description }}</small>
                          </td>
                          <td>
                            <select (change)="setStatus(x, $any($event.target).value)">
                              @for (s of statuses; track s) {
                                <option [value]="s" [selected]="s === x.status">{{ s }}</option>
                              }
                            </select>
                          </td>
                          <td>{{ x.assignedAt | date:'mediumDate' }}</td>
                          <td class="actions">
                            <button class="btn-ghost" (click)="editTask(x)">Edit</button>
                            <button class="btn-ghost danger" (click)="deleteTask(x)">Delete</button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </section>
            }
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .page {
      padding: 1.5rem;
    }
    .hero__head, .chips, .row, .actions {
      display: flex;
      align-items: center;
    }
    .avatar {
      display: grid;
      place-items: center;
      background: var(--gradient-brand);
      color: #fff;
      width: 4rem;
      height: 4rem;
      border-radius: 1.3rem;
      font-size: 1.3rem;
      font-weight: 700;
    }
    .hero {
      background: linear-gradient(135deg, var(--color-slate-900), var(--color-slate-700));
      color: #fff;
    }
    .grid {
      display: grid;
      gap: 1.5rem;
      margin-top: 1.5rem;
    }
    .assistant__head, .table__head {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-start;
    }
    .chips {
      flex-wrap: wrap;
      gap: 0.65rem;
    }
    .answer {
      padding: 1rem;
      border-radius: 1rem;
      background: var(--color-slate-50);
      line-height: 1.7;
      white-space: pre-wrap;
    }
    select {
      min-height: 2.6rem;
      padding: 0 0.8rem;
      border-radius: 0.9rem;
      background: var(--color-orange-50);
      color: #9a3412;
      border: 0;
      font: inherit;
    }
    .user-form {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.85rem;
    }
    .toggle {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      padding: 0.9rem 0;
    }
    .actions {
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .admin .row {
      gap: 0.8rem;
      flex-wrap: wrap;
    }
    .active-row {
      background: var(--color-orange-50);
    }
    @media (max-width: 980px) {
      .page {
        padding: 1rem;
      }
      .table__head, .assistant__head {
        flex-direction: column;
        align-items: stretch;
      }
      .user-form {
        grid-template-columns: 1fr 1fr;
      }
    }
    @media (max-width: 640px) {
      .user-form {
        grid-template-columns: 1fr;
      }
      .brand strong, .brand span {
        max-width: 12rem;
      }
      .stats article {
        min-width: calc(50% - 0.5rem);
      }
    }
  `]
})
export class PortalComponent {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly me = auth;
  readonly records = signal<StaffRecord[]>([]);
  readonly users = signal<User[]>([]);
  readonly selectedUserId = signal('');
  readonly selectedRecords = signal<StaffRecord[]>([]);
  readonly loading = signal(true);
  readonly thinking = signal(false);
  readonly answer = signal('');
  readonly editing = signal('');
  readonly editingTask = signal('');

  readonly recordSearch = this.fb.nonNullable.control('');
  readonly userSearch = this.fb.nonNullable.control('');
  readonly question = this.fb.nonNullable.control('');

  readonly recordSearchQuery = signal('');
  readonly userSearchQuery = signal('');

  readonly departments = ['Cyber', 'Marketing', 'Development', 'Operations', 'Finance', 'Human Resources'];
  readonly jobs = ['Manager', 'Junior Engineer', 'Senior Engineer', 'Intern', 'Analyst', 'Coordinator'];
  readonly statuses = ['Active', 'Pending', 'Closed'];

  readonly userForm = this.fb.nonNullable.group({
    id: [''],
    name: ['', Validators.required],
    username: ['', [Validators.required, Validators.email]],
    password: ['Temp@12345'],
    role: ['General User'],
    department: ['Development'],
    jobTitle: ['Junior Engineer'],
    salary: [24000],
    active: [true]
  });

  readonly taskForm = this.fb.nonNullable.group({
    id: [''],
    title: ['', Validators.required],
    description: ['', Validators.required],
    status: ['Pending'],
    assignedTo: ['']
  });

  readonly filteredRecords = computed(() =>
    this.records().filter((x) =>
      [x.title, x.description, x.status, x.assignedToName]
        .join(' ')
        .toLowerCase()
        .includes(this.recordSearchQuery().trim().toLowerCase())
    )
  );

  readonly filteredUsers = computed(() =>
    this.users().filter((x) =>
      [x.name, x.username, x.department, x.jobTitle, x.role, x.salary]
        .join(' ')
        .toLowerCase()
        .includes(this.userSearchQuery().trim().toLowerCase())
    )
  );

  readonly selectedUser = computed(() =>
    this.users().find((x) => x.id === this.selectedUserId()) || null
  );

  readonly prompts = computed(() =>
    this.isAdmin()
      ? ['Who has the highest salary?', 'Which tasks are pending?', 'Summarize the active users.']
      : ['What tasks are assigned to me?', 'Summarize my profile details.', 'Which of my tasks are pending?']
  );

  constructor() {
    this.load();
    this.recordSearch.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef))
      .subscribe((val) => this.recordSearchQuery.set(val));
    this.userSearch.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef))
      .subscribe((val) => this.userSearchQuery.set(val));

    const events = new EventSource(`${api}/events`, { withCredentials: true } as EventSourceInit);
    events.onmessage = (event) => {
      const data = JSON.parse(event.data) as { type: string };
      if (data.type !== 'ready') {
        this.load(false);
      }
    };
    this.destroyRef.onDestroy(() => events.close());
  }

  isAdmin() {
    return this.me()?.role === 'Admin';
  }

  initials() {
    return (this.me()?.name || 'MC')
      .split(' ')
      .map((x) => x[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  count(status: string) {
    return this.filteredRecords().filter((x) => x.status === status).length;
  }

  signOut() {
    logout(this.http, this.router)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  load(show = true) {
    if (show) {
      this.loading.set(true);
    }
    forkJoin({
      user: loadMe(this.http),
      records: this.http.get<StaffRecord[]>(`${api}/records?delay=1500`),
      users: this.isAdmin() ? this.http.get<User[]>(`${api}/users`) : of([] as User[])
    })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ user, records, users }) => {
        if (!user) {
          return void this.router.navigateByUrl('/login');
        }
        this.records.set(records);
        this.users.set(users as User[]);
        if (this.selectedUserId()) {
          const matched = this.users().find((x) => x.id === this.selectedUserId());
          this.pickUser(matched || null);
        }
      });
  }

  ask() {
    this.thinking.set(true);
    this.answer.set('');
    this.http.post<{ answer: string }>(`${api}/assistant/chat`, { question: this.question.value.trim() })
      .pipe(
        finalize(() => this.thinking.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (x) => this.answer.set(x.answer),
        error: () => this.answer.set('Assistant is unavailable right now.')
      });
  }

  pickUser(user: User | null) {
    if (!user) return;
    this.selectedUserId.set(user.id);
    this.http.get<StaffRecord[]>(`${api}/users/${user.id}/records`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((records) => this.selectedRecords.set(records));
  }

  setStatus(record: StaffRecord, status: string) {
    this.http.patch<StaffRecord>(`${api}/records/${record.id}`, { status })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((updated) => {
        this.records.update((rows) => rows.map((x) => (x.id === updated.id ? updated : x)));
        this.selectedRecords.update((rows) => rows.map((x) => (x.id === updated.id ? updated : x)));
      });
  }

  edit(user?: User) {
    this.editing.set(user?.id || 'new');
    this.userForm.setValue({
      id: user?.id || '',
      name: user?.name || '',
      username: user?.username || '',
      password: 'Temp@12345',
      role: user?.role || 'General User',
      department: user?.department || 'Development',
      jobTitle: user?.jobTitle || 'Junior Engineer',
      salary: user?.salary || 24000,
      active: user?.active ?? true
    });
  }

  saveUser() {
    if (this.userForm.invalid) {
      alert('Please ensure all fields are valid. Username must be an email format.');
      return;
    }
    const value = this.userForm.getRawValue();
    const mode = this.editing();
    const request = mode === 'new'
      ? this.http.post<User>(`${api}/users`, value)
      : this.http.put<User>(`${api}/users/${value.id}`, {
          name: value.name,
          role: value.role,
          department: value.department,
          jobTitle: value.jobTitle,
          salary: value.salary,
          active: value.active
        });
    request
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.editing.set('');
          this.users.update((rows) => 
            mode === 'new' ? [user, ...rows] : rows.map((x) => (x.id === user.id ? user : x))
          );
          this.load(false);
        },
        error: (err) => alert(err.error?.message || 'Failed to save user. Check if email already exists.')
      });
  }

  deactivate(user: User) {
    this.http.delete<User>(`${api}/users/${user.id}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((updated) => {
        this.users.update((rows) => rows.map((x) => (x.id === updated.id ? updated : x)));
        if (this.selectedUserId() === updated.id) {
          this.pickUser(updated);
        }
      });
  }

  editTask(record?: StaffRecord) {
    this.editingTask.set(record?.id || 'new');
    this.taskForm.setValue({
      id: record?.id || '',
      title: record?.title || '',
      description: record?.description || '',
      status: record?.status || 'Pending',
      assignedTo: record?.assignedTo || this.selectedUserId()
    });
  }

  saveTask() {
    if (this.taskForm.invalid) {
      alert('Please fill out all task fields.');
      return;
    }
    const value = this.taskForm.getRawValue();
    const mode = this.editingTask();
    const request = mode === 'new'
      ? this.http.post<StaffRecord>(`${api}/records`, value)
      : this.http.put<StaffRecord>(`${api}/records/${value.id}`, {
          title: value.title,
          description: value.description,
          status: value.status,
          assignedTo: value.assignedTo
        });
    request
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (record) => {
          this.editingTask.set('');
          this.records.update((rows) => 
            mode === 'new' ? [record, ...rows] : rows.map((x) => (x.id === record.id ? record : x))
          );
          this.pickUser(this.selectedUser());
        },
        error: (err) => alert(err.error?.message || 'Failed to save task.')
      });
  }

  deleteTask(record: StaffRecord) {
    if (!confirm(`Are you sure you want to delete task: ${record.title}?`)) return;
    this.http.delete(`${api}/records/${record.id}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.records.update((rows) => rows.filter((x) => x.id !== record.id));
        this.selectedRecords.update((rows) => rows.filter((x) => x.id !== record.id));
      });
  }
}
