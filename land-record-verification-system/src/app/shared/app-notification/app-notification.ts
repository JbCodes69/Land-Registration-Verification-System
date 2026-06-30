import { AsyncPipe, CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  AppNotificationService,
  AppNotificationState,
} from '../../services/app-notification.service';

@Component({
  selector: 'app-notification',
  imports: [CommonModule, AsyncPipe],
  templateUrl: './app-notification.html',
  styleUrl: './app-notification.css',
})
export class AppNotification {
  readonly state$;

  constructor(private notificationService: AppNotificationService) {
    this.state$ = this.notificationService.state$;
  }

  getPanelClass(type: AppNotificationState['type']): string {
    const classes: Record<AppNotificationState['type'], string> = {
      success: 'app-notification-success',
      error: 'app-notification-error',
      warning: 'app-notification-warning',
      confirm: 'app-notification-confirm',
    };

    return classes[type];
  }

  getIconLabel(type: AppNotificationState['type']): string {
    const labels: Record<AppNotificationState['type'], string> = {
      success: 'OK',
      error: '!',
      warning: '!',
      confirm: '?',
    };

    return labels[type];
  }

  close(): void {
    this.notificationService.cancelCurrent();
  }

  confirm(): void {
    this.notificationService.confirmCurrent();
  }

  cancel(): void {
    this.notificationService.cancelCurrent();
  }
}
