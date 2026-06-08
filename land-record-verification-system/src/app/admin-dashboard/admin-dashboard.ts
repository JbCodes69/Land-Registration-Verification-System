import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import {
  Application,
  ApplicationStatus,
  Payment,
  User,
  WorkflowType,
} from '../models/api.models';

@Component({
  selector: 'app-admin-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css'
})
export class AdminDashboard {
  // Logged-in admin display name
  adminName: string = 'Administrator';
  isLoading: boolean = false;
  errorMessage: string = '';

  // Top overview values for the new system scope
  totalApplications: number = 0;
  pendingReview: number = 0;
  flaggedDisputes: number = 0;
  completedPayments: number = 0;

  // Recent applications awaiting admin action
  recentApplications: Array<{
    reference: string;
    applicant: string;
    workflow: string;
    submittedDate: string;
    status: string;
  }> = [];

  // Verification overview values
  verifiedRecords: number = 0;
  alreadyRegisteredAlerts: number = 0;
  disputeCautionResults: number = 0;

  // Admin alert cards
  systemAlerts: string[] = [];

  // Audit and payment snapshot values
  reviewLogEntries: number = 0;
  verificationLogs: number = 0;
  pendingPayments: number = 0;

  constructor(private apiService: ApiService, private authService: AuthService) {}

  ngOnInit(): void {
    this.adminName = this.authService.getCurrentUser()?.full_name || this.adminName;
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      applications: this.apiService.getApplications(),
      statuses: this.apiService.getApplicationStatuses(),
      workflowTypes: this.apiService.getWorkflowTypes(),
      users: this.apiService.getUsers(),
      reviewLogs: this.apiService.getReviewLogs(),
      disputeFlags: this.apiService.getDisputeFlags(),
      payments: this.apiService.getPayments(),
      verificationLogs: this.apiService.getVerificationLogs(),
    }).subscribe({
      next: ({
        applications,
        statuses,
        workflowTypes,
        users,
        reviewLogs,
        disputeFlags,
        payments,
        verificationLogs,
      }) => {
        this.totalApplications = applications.length;
        this.pendingReview = applications.filter((application) =>
          ['Submitted', 'Pending Review', 'Queried'].includes(
            this.getStatusName(application, statuses)
          )
        ).length;
        this.flaggedDisputes = disputeFlags.length;
        this.completedPayments = payments.filter((payment) =>
          this.isCompletedPayment(payment)
        ).length;

        this.recentApplications = applications
          .slice()
          .sort(
            (a, b) =>
              new Date(b.submitted_at).getTime() -
              new Date(a.submitted_at).getTime()
          )
          .slice(0, 5)
          .map((application) => ({
            reference: application.application_code,
            applicant: this.getApplicantName(application, users),
            workflow: this.getWorkflowName(application, workflowTypes),
            submittedDate: this.formatDate(application.submitted_at),
            status: this.getStatusName(application, statuses),
          }));

        this.verifiedRecords = verificationLogs.length;
        this.alreadyRegisteredAlerts = verificationLogs.filter((log) =>
          log.result_summary.toLowerCase().includes('registered')
        ).length;
        this.disputeCautionResults = verificationLogs.filter((log) =>
          log.result_summary.toLowerCase().includes('dispute')
        ).length;

        this.reviewLogEntries = reviewLogs.length;
        this.verificationLogs = verificationLogs.length;
        this.pendingPayments = payments.filter((payment) =>
          ['pending', 'pending payment'].includes(payment.payment_status.toLowerCase())
        ).length;

        this.systemAlerts = [
          `${this.pendingReview} application(s) are awaiting administrative review.`,
          `${this.flaggedDisputes} disputed or flagged record(s) require attention.`,
          `${this.completedPayments} payment record(s) are marked completed or successful.`,
        ];

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load admin dashboard data:', error);
        this.errorMessage = 'Unable to load admin dashboard data from the server.';
        this.isLoading = false;
      },
    });
  }

  getStatusName(application: Application, statuses: ApplicationStatus[]): string {
    return (
      statuses.find((status) => status.status_id === application.status)
        ?.status_name || 'Unknown'
    );
  }

  getWorkflowName(application: Application, workflowTypes: WorkflowType[]): string {
    return (
      workflowTypes.find(
        (workflow) => workflow.workflow_type_id === application.workflow_type
      )?.workflow_name || 'Unknown'
    );
  }

  getApplicantName(application: Application, users: User[]): string {
    return (
      users.find((user) => user.user_id === application.user)?.full_name ||
      `User #${application.user}`
    );
  }

  isCompletedPayment(payment: Payment): boolean {
    return ['completed', 'successful', 'success'].includes(
      payment.payment_status.toLowerCase()
    );
  }

  getStatusBadgeClass(status: string): string {
    if (['Approved', 'Registered', 'Completed'].includes(status)) {
      return 'bg-green-100 text-green-700';
    }

    if (['Submitted', 'Pending Review'].includes(status)) {
      return 'bg-yellow-100 text-yellow-700';
    }

    if (status === 'Queried') {
      return 'bg-orange-100 text-orange-700';
    }

    return 'bg-red-100 text-red-700';
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString();
  }

  logout(): void {
    this.authService.logout();
  }

  // Placeholder navigation actions for future logic
  openApplication(reference: string): void {
    console.log('Open application:', reference);
  }

  openReviewQueue(): void {
    console.log('Open review queue');
  }

  openVerificationModule(): void {
    console.log('Open verification module');
  }

  openDisputesModule(): void {
    console.log('Open disputes module');
  }

  openAuditLogs(): void {
    console.log('Open audit logs');
  }

  openPaymentsModule(): void {
    console.log('Open payments module');
  }
}
