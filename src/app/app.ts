import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SmartbannerService } from './smartbanner.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('appTest');

  constructor() {
    inject(SmartbannerService).init();
  }
}
