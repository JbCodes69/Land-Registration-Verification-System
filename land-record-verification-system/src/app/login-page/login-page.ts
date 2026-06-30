import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { CurrentUser } from '../models/api.models';

@Component({
  selector: 'app-login-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPage {
  
  // Short app name shown in the logo area
  abbrev: string = 'LRV';

  
  loginWelcomeTitle: string = 'Welcome back to the Land Registration and Verification Portal';

  loginDescription: string =
    'Enter your email and password to access the secure land record verification system.';

  
  systemFooterText: string =
    'Land Registration and Verification System';

  // -------- FORM STATE VARIABLES --------

  // Login form fields
  email: string = '';
  password: string = '';

  // Checkbox state
  termsAccepted: boolean = false;

  // UI feedback message
  message: string = '';
  messageType: 'success' | 'error' | '' = '';
  isSubmitting: boolean = false;

  constructor(
    private router: Router,
    private apiService: ApiService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.authService.clearCurrentUser();
  }

  // -------- HELPER METHODS --------

  showError(message: string): void {
    this.message = message;
    this.messageType = 'error';
  }

  
  showSuccess(message: string): void {
    this.message = message;
    this.messageType = 'success';
  }

    clearMessage(): void {
    this.message = '';
    this.messageType = '';
  }

  // Tracks checkbox state
  onTermsToggle(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.termsAccepted = input.checked;
  }

  login(event: Event): void {
    event.preventDefault();
    this.clearMessage();

    // Check required fields
    if (!this.email || !this.password) {
      this.showError('Please enter both email and password.');
      return;
    }

    // Optional checkbox validation
    if (!this.termsAccepted) {
      this.showError('Please accept the terms before signing in.');
      return;
    }

    this.isSubmitting = true;

    this.apiService.login({
      email: this.email,
      password: this.password,
    }).subscribe({
      next: (response) => {
        const currentUser = this.normalizeAuthUser(response);
        const tokens = this.normalizeTokens(response);

        if (!currentUser || !tokens) {
          this.isSubmitting = false;
          this.showError('Login succeeded, but the token or user details were not returned correctly.');
          return;
        }

        this.authService.setSession(currentUser, tokens.access, tokens.refresh);
        this.showSuccess('Login successful. Redirecting...');

        setTimeout(() => {
          this.router.navigate([this.authService.getDashboardRoute(currentUser)]);
        }, 700);
      },
      error: (error) => {
        console.error('Login failed.');
        this.isSubmitting = false;
        this.showError(
          error?.error?.detail ||
          error?.error?.message ||
          'Invalid email or password.'
        );
      },
    });
  }

  normalizeAuthUser(response: unknown): CurrentUser | null {
    const responseObject = response as Record<string, any>;
    const user = (responseObject?.['user'] || responseObject) as Record<string, any>;
    const role = user?.['role'];
    const roleObject = typeof role === 'object' && role !== null ? role : null;
    const roleName =
      user?.['role_name'] ||
      responseObject?.['role_name'] ||
      roleObject?.['role_name'] ||
      '';
    const roleId =
      Number(user?.['role_id'] || responseObject?.['role_id'] || roleObject?.['role_id'] || role || 0);

    if (!user?.['user_id'] || !roleName) {
      return null;
    }

    return {
      user_id: Number(user['user_id']),
      full_name: String(user['full_name'] || ''),
      email: String(user['email'] || ''),
      phone_number: String(user['phone_number'] || ''),
      role_id: roleId,
      role_name: String(roleName),
      is_active: Boolean(user['is_active']),
    };
  }

  normalizeTokens(response: unknown): { access: string; refresh: string } | null {
    const responseObject = response as Record<string, any>;
    const access = responseObject?.['access'];
    const refresh = responseObject?.['refresh'];

    if (!access || !refresh) {
      return null;
    }

    return {
      access: String(access),
      refresh: String(refresh),
    };
  }
}
