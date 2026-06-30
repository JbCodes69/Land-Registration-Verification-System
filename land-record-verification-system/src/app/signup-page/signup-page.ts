import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-signup-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './signup-page.html',
  styleUrl: './signup-page.css',
})
export class SignupPage {
  // -------- DISPLAY TEXT PLACEHOLDERS --------
  abbrev: string = 'LRV';

  signupWelcomeTitle: string = 'Create your account for secure land record access';


  systemFooterText: string =
    'Land Registration and Verification System';

  // -------- FORM STATE VARIABLES --------

  // User form fields
  fullName: string = '';
  email: string = '';
  phoneNumber: string = '';
  password: string = '';
  confirmPassword: string = '';
  applicantRoleId: number | null = null;

  // OTP values
  enteredOtp: string = '';

  // Boolean that tracks whether OTP has been verified successfully
  isOtpVerified: boolean = false;

  // UI state for messages
  message: string = '';
  messageType: 'success' | 'error' | '' = '';
  isSubmitting: boolean = false;

  constructor(private router: Router, private apiService: ApiService) {}

  ngOnInit(): void {
    this.loadApplicantRole();
  }

  loadApplicantRole(): void {
    this.apiService.getRoles().subscribe({
      next: (roles) => {
        this.applicantRoleId =
          roles.find((role) => role.role_name.toLowerCase() === 'applicant')
            ?.role_id || null;
      },
      error: (error) => {
        console.error('Failed to load roles for signup.');
      },
    });
  }

  // -------- HELPER METHODS --------

  // Shows an error message in the UI
  showError(message: string): void {
    this.message = message;
    this.messageType = 'error';
  }

  // Shows a success message in the UI
  showSuccess(message: string): void {
    this.message = message;
    this.messageType = 'success';
  }

  // Clears any previous success/error message
  clearMessage(): void {
    this.message = '';
    this.messageType = '';
  }

  getBackendErrorMessage(errorResponse: unknown): string {
    const error = errorResponse as Record<string, unknown> | undefined;
    const otpError = error?.['otp_code'];
    const emailError = error?.['email'];

    if (otpError) {
      return Array.isArray(otpError) ? String(otpError[0]) : String(otpError);
    }

    if (emailError) {
      return Array.isArray(emailError) ? String(emailError[0]) : String(emailError);
    }

    const detail = error?.['detail'];
    const message = error?.['message'];

    if (detail) {
      return String(detail);
    }

    if (message) {
      return String(message);
    }

    return 'Something went wrong. Please try again.';
  }

  // -------- OTP LOGIC --------


  generateOtp(): void {
    this.clearMessage();

    // Basic validation before generating OTP
    if (!this.fullName || !this.email || !this.phoneNumber || !this.password || !this.confirmPassword) {
      this.showError('Please fill in all fields before generating OTP.');
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.showError('Passwords do not match.');
      return;
    }

    this.isOtpVerified = false;

    this.apiService.requestOtp({
      email: this.email,
      purpose: 'Signup',
    }).subscribe({
      next: () => {
        this.showSuccess('OTP sent to your email.');
      },
      error: (error) => {
        console.error('Request OTP failed.');
        this.showError(this.getBackendErrorMessage(error?.error));
      },
    });
  }

  // Verifies the OTP entered by the user
  verifyOtp(): void {
    this.clearMessage();

    if (!this.email) {
      this.showError('Please generate an OTP first.');
      return;
    }

    if (!this.enteredOtp) {
      this.showError('Please enter the OTP.');
      return;
    }

    this.apiService.verifyOtp({
      email: this.email,
      otp_code: this.enteredOtp,
      purpose: 'Signup',
    }).subscribe({
      next: () => {
        this.isOtpVerified = true;
        this.showSuccess('OTP verified successfully.');
      },
      error: (error) => {
        console.error('Verify OTP failed.');
        this.isOtpVerified = false;
        this.showError(this.getBackendErrorMessage(error?.error));
      },
    });
  }

  // -------- ACCOUNT CREATION LOGIC --------

  
  createAccount(event: Event): void {
    event.preventDefault();
    this.clearMessage();

    // Validate all required fields
    if (!this.fullName || !this.email || !this.phoneNumber || !this.password || !this.confirmPassword) {
      this.showError('Please complete all required fields.');
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.showError('Passwords do not match.');
      return;
    }

    if (!this.isOtpVerified) {
      this.showError('Please verify your OTP before creating an account.');
      return;
    }

    if (!this.applicantRoleId) {
      this.showError('Applicant role is unavailable. Please try again shortly.');
      return;
    }

    this.isSubmitting = true;

    this.apiService.signup({
      full_name: this.fullName,
      email: this.email,
      phone_number: this.phoneNumber,
      password: this.password,
      role_id: this.applicantRoleId,
      otp_code: this.enteredOtp,
    }).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.showSuccess('Account created successfully. Redirecting to login...');

        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 1200);
      },
      error: (error) => {
        console.error('Signup failed.');
        this.isSubmitting = false;
        this.showError(this.getBackendErrorMessage(error?.error));
      },
    });
  }
}
