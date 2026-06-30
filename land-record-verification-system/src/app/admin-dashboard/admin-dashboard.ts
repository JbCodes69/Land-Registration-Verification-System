import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import {
  Application,
  ApplicationStatus,
  DisputeFlag,
  LandDetail,
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
  isSidebarOpen: boolean = false;
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
    applicationId: number;
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

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private router: Router
  ) {}

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
      landDetails: this.apiService.getLandDetails(),
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
        landDetails,
        disputeFlags,
        payments,
        verificationLogs,
      }) => {
        const adminApplications = applications.filter((application) =>
          this.isAdminVisibleApplication(application, statuses)
        );

        this.totalApplications = adminApplications.length;
        this.pendingReview = adminApplications.filter((application) =>
          ['Submitted', 'Pending Review', 'Queried'].includes(
            this.getDisplayStatusName(application, statuses, landDetails, disputeFlags)
          )
        ).length;
        this.flaggedDisputes = adminApplications.filter(
          (application) =>
            this.getDisplayStatusName(application, statuses, landDetails, disputeFlags) ===
            'Disputed'
        ).length;
        this.completedPayments = payments.filter((payment) =>
          this.isCompletedPayment(payment)
        ).length;

        this.recentApplications = adminApplications
          .slice()
          .sort(
            (a, b) =>
              new Date(b.submitted_at).getTime() -
              new Date(a.submitted_at).getTime()
          )
          .slice(0, 5)
          .map((application) => ({
            applicationId: application.application_id,
            reference: application.application_code,
            applicant: this.getApplicantName(application, users),
            workflow: this.getWorkflowName(application, workflowTypes),
            submittedDate: this.formatDate(application.submitted_at),
            status: this.getDisplayStatusName(
              application,
              statuses,
              landDetails,
              disputeFlags
            ),
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
        console.error('Failed to load admin dashboard data.');
        this.errorMessage = 'Unable to load admin dashboard data from the server.';
        this.isLoading = false;
      },
    });
  }

  getStatusName(application: Application, statuses: ApplicationStatus[]): string {
    return (
      statuses.find((status) => status.status_id === application.status)
        ?.status_name || 'Not specified'
    );
  }

  getDisplayStatusName(
    application: Application,
    statuses: ApplicationStatus[],
    landDetails: LandDetail[],
    disputeFlags: DisputeFlag[]
  ): string {
    const baseStatus = this.getStatusName(application, statuses);
    if (baseStatus.toLowerCase() === 'rejected') {
      return 'Rejected';
    }

    const landDetail = landDetails.find(
      (item) => item.application === application.application_id
    );
    const hasActiveDispute =
      !!landDetail &&
      (landDetail.is_disputed ||
        disputeFlags.some(
          (flag) =>
            Number(flag.land_detail) === Number(landDetail.land_detail_id) &&
            (flag.flag_status || '').toLowerCase() !== 'resolved'
        ));

    return hasActiveDispute ? 'Disputed' : baseStatus;
  }

  getWorkflowName(application: Application, workflowTypes: WorkflowType[]): string {
    const workflowTypeId = Number(application.workflow_type);
    const workflowName =
      workflowTypes.find(
        (workflow) => Number(workflow.workflow_type_id) === workflowTypeId
      )?.workflow_name || '';

    return this.normalizeServiceType(workflowName);
  }

  normalizeServiceType(serviceName: string): string {
    const normalizedServiceName = (serviceName || '').trim().toLowerCase();
    const serviceNames: Record<string, string> = {
      registration: 'Land Registration',
      'land registration': 'Land Registration',
      transfer: 'Transfer of Title',
      'transfer of title': 'Transfer of Title',
      concurrence: 'Concurrence',
      consent: 'Consent',
      verification: 'Land Verification',
      'land verification': 'Land Verification',
    };

    return serviceNames[normalizedServiceName] || serviceName.trim() || 'Service type not available';
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

    if (status === 'Queried' || status === 'Disputed') {
      return 'bg-orange-100 text-orange-700';
    }

    return 'bg-red-100 text-red-700';
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString('en-GH', {
      timeZone: 'Africa/Accra',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  logout(): void {
    this.authService.logout();
  }

  openApplicationReview(applicationId: number): void {
    localStorage.setItem('adminReviewApplicationId', String(applicationId));
    this.router.navigate(['/admin/review']);
  }

  isAdminVisibleApplication(application: Application, statuses: ApplicationStatus[]): boolean {
    const normalizedStatus = this.getStatusName(application, statuses).toLowerCase();
    const hiddenStatuses = ['draft', 'pending submission', 'in progress'];

    return !!application.submitted_at && !hiddenStatuses.includes(normalizedStatus);
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }}
