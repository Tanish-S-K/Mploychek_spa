// app.component.ts: Root application component that renders the active route outlet.
// Dependencies: @angular/core, @angular/router

import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class AppComponent {}
