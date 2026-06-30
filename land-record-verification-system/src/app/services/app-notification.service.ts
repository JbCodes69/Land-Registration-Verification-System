import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type AppNotificationType = 'success' | 'error' | 'warning' | 'confirm';

export interface AppNotificationState {
  isOpen: boolean;
  type: AppNotificationType;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  autoClose: boolean;
  requiresAction: boolean;
}

const emptyState: AppNotificationState = {
  isOpen: false,
  type: 'success',
  title: '',
  message: '',
  confirmText: 'Continue',
  cancelText: 'Cancel',
  autoClose: true,
  requiresAction: false,
};

@Injectable({
  providedIn: 'root',
})
export class AppNotificationService {
  private readonly stateSubject = new BehaviorSubject<AppNotificationState>(emptyState);
  readonly state$ = this.stateSubject.asObservable();
  private confirmResolver: ((confirmed: boolean) => void) | null = null;
  private autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  success(message: string, title = 'Success'): void {
    this.showMessage('success', message, title);
  }

  error(message: string, title = 'Error'): void {
    this.showMessage('error', message, title);
  }

  errorAndWait(message: string, title = 'Error'): Promise<void> {
    return this.showActionMessage('error', message, title, 'OK').then(() => undefined);
  }

  warning(message: string, title = 'Warning'): void {
    this.showMessage('warning', message, title);
  }

  confirm(
    message: string,
    title = 'Confirm action',
    confirmText = 'Continue',
    cancelText = 'Cancel'
  ): Promise<boolean> {
    this.clearTimer();
    this.resolveExistingConfirm(false);

    this.stateSubject.next({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      confirmText,
      cancelText,
      autoClose: false,
      requiresAction: true,
    });

    return new Promise<boolean>((resolve) => {
      this.confirmResolver = resolve;
    });
  }

  confirmCurrent(): void {
    this.resolveExistingConfirm(true);
    this.close();
  }

  cancelCurrent(): void {
    this.resolveExistingConfirm(false);
    this.close();
  }

  close(): void {
    this.clearTimer();
    this.stateSubject.next(emptyState);
  }

  private showMessage(
    type: Exclude<AppNotificationType, 'confirm'>,
    message: string,
    title: string
  ): void {
    this.clearTimer();
    this.resolveExistingConfirm(false);
    this.stateSubject.next({
      ...emptyState,
      isOpen: true,
      type,
      title,
      message,
      autoClose: true,
      requiresAction: false,
    });
    this.autoCloseTimer = setTimeout(() => this.close(), 3000);
  }

  private showActionMessage(
    type: Exclude<AppNotificationType, 'confirm'>,
    message: string,
    title: string,
    confirmText: string
  ): Promise<boolean> {
    this.clearTimer();
    this.resolveExistingConfirm(false);
    this.stateSubject.next({
      ...emptyState,
      isOpen: true,
      type,
      title,
      message,
      confirmText,
      autoClose: false,
      requiresAction: true,
    });

    return new Promise<boolean>((resolve) => {
      this.confirmResolver = resolve;
    });
  }

  private resolveExistingConfirm(value: boolean): void {
    if (!this.confirmResolver) {
      return;
    }

    this.confirmResolver(value);
    this.confirmResolver = null;
  }

  private clearTimer(): void {
    if (!this.autoCloseTimer) {
      return;
    }

    clearTimeout(this.autoCloseTimer);
    this.autoCloseTimer = null;
  }
}
