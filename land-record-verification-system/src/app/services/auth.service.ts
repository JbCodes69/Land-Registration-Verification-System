import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { CurrentUser } from '../models/api.models';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly currentUserKey = 'currentUser';
  private readonly accessTokenKey = 'accessToken';
  private readonly refreshTokenKey = 'refreshToken';
  private readonly userScopedStorageKeys = [
    'selectedWorkflow',
    'selectedWorkflowLabel',
    'selectedWorkflowTypeId',
    'currentApplicationId',
    'currentApplicationCode',
    'currentLandDetailId',
    'applicationFormData',
    'uploadedDocumentData',
    'uploadedDocumentRecords',
    'currentPayment',
    'applicationSubmissionStatus',
    'applicationDraftStatus',
    'adminReviewApplicationId',
  ];
  private readonly userScopedSessionKeys = ['applicationDraft'];

  constructor(private router: Router) {}

  getAccessToken(): string | null {
    return localStorage.getItem(this.accessTokenKey);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.refreshTokenKey);
  }

  getCurrentUser(): CurrentUser | null {
    const savedUser = localStorage.getItem(this.currentUserKey);

    if (!savedUser) {
      return null;
    }

    try {
      return JSON.parse(savedUser) as CurrentUser;
    } catch {
      console.error('Unable to parse current user from localStorage.');
      this.clearCurrentUser();
      return null;
    }
  }

  setCurrentUser(user: CurrentUser): void {
    localStorage.setItem(this.currentUserKey, JSON.stringify(user));
    localStorage.setItem('currentUserId', String(user.user_id));
  }

  setSession(user: CurrentUser, accessToken: string, refreshToken: string): void {
    const existingUser = this.getCurrentUser();
    if (!existingUser || existingUser.user_id !== user.user_id) {
      this.clearUserScopedState();
    }

    localStorage.setItem(this.accessTokenKey, accessToken);
    localStorage.setItem(this.refreshTokenKey, refreshToken);
    this.setCurrentUser(user);
  }

  clearUserScopedState(): void {
    this.userScopedStorageKeys.forEach((key) => localStorage.removeItem(key));
    this.userScopedSessionKeys.forEach((key) => sessionStorage.removeItem(key));
  }

  clearCurrentUser(): void {
    this.clearUserScopedState();
    localStorage.removeItem(this.currentUserKey);
    localStorage.removeItem(this.accessTokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem('currentUserId');
    localStorage.removeItem('adminUserId');
  }

  logout(): void {
    this.clearCurrentUser();
    this.router.navigate(['/login']);
  }

  getCurrentUserId(): number | null {
    return this.getCurrentUser()?.user_id || null;
  }

  hasValidLoginData(): boolean {
    return !!this.getCurrentUser() && !!this.getAccessToken();
  }

  isApplicant(user: CurrentUser | null = this.getCurrentUser()): boolean {
    return user?.role_id === 1 || user?.role_name?.toLowerCase() === 'applicant';
  }

  isAdministrator(user: CurrentUser | null = this.getCurrentUser()): boolean {
    return user?.role_id === 2 || user?.role_name?.toLowerCase() === 'administrator';
  }

  getDashboardRoute(user: CurrentUser): string {
    if (this.isAdministrator(user)) {
      return '/admin-dashboard';
    }

    if (this.isApplicant(user)) {
      return '/user-dashboard';
    }

    return '/login';
  }
}
