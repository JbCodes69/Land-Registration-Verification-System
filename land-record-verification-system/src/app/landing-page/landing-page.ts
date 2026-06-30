import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-landing-page',
  imports: [],
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.css'
})
export class LandingPage {
  // App short name shown in the logo area
  abbrev: string = 'LRV';

  welcomeTitle: string = 'Welcome to the Land Record Verification Portal';

  
  platformDescription: string =
    'Access your secure land record verification platform. Sign in to search, verify, and manage land record activities with ease.';

  
  systemFooterText: string =
    'Secure Web-Based Land Record Verification and Access System';

  // Placeholder boolean for checkbox state
  // Later, this can be used to control whether the user is allowed to proceed
  termsAccepted: boolean = false;

  constructor(private router: Router) {}

  // Handles checkbox state change
  onTermsToggle(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.termsAccepted = input.checked;
  }

  // Navigates user to the login page
  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  // Navigates user to the signup page
  goToSignup(): void {
    this.router.navigate(['/signup']);
  }
}
