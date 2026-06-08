import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import {
  Application,
  ApplicationStatus,
  Notification,
  Payment,
  VerificationLog,
  WorkflowType,
} from '../models/api.models';

@Component({
  selector: 'app-user-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './user-dashboard.html',
  styleUrl: './user-dashboard.css'
})
export class UserDashboard {
  // Logged-in user display name
  userName: string = 'User';
  currentUserId: number = 0;
  isLoading: boolean = false;
  errorMessage: string = '';

  // Top overview card values
  totalApplications: number = 0;
  pendingReview: number = 0;
  totalVerifications: number = 0;
  unreadNotifications: number = 0;

  // Recent application data
  recentApplications: Array<{
    reference: string;
    workflow: string;
    submittedDate: string;
    status: string;
  }> = [];

  // Recent land verification activity
  recentVerifications: Array<{
    record: string;
    dateTime: string;
    result: string;
  }> = [];

  // Notification panel data
  notifications: Array<{
    type: 'warning' | 'success' | 'danger';
    message: string;
  }> = [];

  // Quick overview values
  approvedApplications: number = 0;
  pendingPayments: number = 0;
  disputeAlerts: number = 0;

  constructor(private apiService: ApiService, private authService: AuthService) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.currentUserId = currentUser?.user_id || 0;
    this.userName = currentUser?.full_name || this.userName;
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      applications: this.apiService.getApplications(),
      statuses: this.apiService.getApplicationStatuses(),
      workflowTypes: this.apiService.getWorkflowTypes(),
      notifications: this.apiService.getNotifications(),
      payments: this.apiService.getPayments(),
      verificationLogs: this.apiService.getVerificationLogs(),
    }).subscribe({
      next: ({
        applications,
        statuses,
        workflowTypes,
        notifications,
        payments,
        verificationLogs,
      }) => {
        console.log('User dashboard applications response:', applications);
        console.log('User dashboard statuses response:', statuses);
        console.log('User dashboard notifications response:', notifications);
        console.log('User dashboard verification logs response:', verificationLogs);

        const userApplications = applications.filter(
          (application) => application.user === this.currentUserId
        );
        const userNotifications = notifications.filter(
          (notification) => notification.user === this.currentUserId
        );
        const applicationIds = userApplications.map(
          (application) => application.application_id
        );
        const userPayments = payments.filter((payment) =>
          applicationIds.includes(payment.application)
        );

        this.totalApplications = userApplications.length;
        this.totalVerifications = verificationLogs.length;
        this.pendingReview = userApplications.filter((application) =>
          ['Submitted', 'Pending Review', 'Queried'].includes(
            this.getStatusName(application, statuses)
          )
        ).length;
        this.approvedApplications = userApplications.filter((application) =>
          ['Approved', 'Registered', 'Completed'].includes(
            this.getStatusName(application, statuses)
          )
        ).length;
        this.unreadNotifications = userNotifications.filter(
          (notification) => !notification.is_read
        ).length;
        this.pendingPayments = userPayments.filter((payment) =>
          ['Pending', 'Pending Payment'].includes(payment.payment_status)
        ).length;
        this.disputeAlerts = userNotifications.filter((notification) =>
          notification.notification_type.toLowerCase().includes('disputed')
        ).length;

        this.recentApplications = userApplications
          .slice()
          .sort(
            (a, b) =>
              new Date(b.submitted_at).getTime() -
              new Date(a.submitted_at).getTime()
          )
          .slice(0, 3)
          .map((application) => ({
            reference: application.application_code,
            workflow: this.getWorkflowName(application, workflowTypes),
            submittedDate: this.formatDate(application.submitted_at),
            status: this.getStatusName(application, statuses),
          }));

        this.notifications = userNotifications.slice(0, 3).map((notification) => ({
          type: this.getNotificationType(notification),
          message: notification.message,
        }));

        this.recentVerifications = verificationLogs
          .filter((verificationLog) => verificationLog.user === this.currentUserId)
          .slice()
          .sort(
            (a, b) =>
              new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime()
          )
          .slice(0, 3)
          .map((verificationLog) => this.mapVerificationLog(verificationLog));

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load user dashboard data:', error);
        this.errorMessage = 'Unable to load dashboard data from the server.';
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

  getNotificationType(notification: Notification): 'warning' | 'success' | 'danger' {
    const type = notification.notification_type.toLowerCase();

    if (type.includes('resolved')) {
      return 'success';
    }

    if (type.includes('disputed')) {
      return 'danger';
    }

    return 'warning';
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString();
  }

  formatDateTime(value: string): string {
    return new Date(value).toLocaleString();
  }

  mapVerificationLog(verificationLog: VerificationLog): {
    record: string;
    dateTime: string;
    result: string;
  } {
    return {
      record: verificationLog.search_term || `Land detail #${verificationLog.land_detail}`,
      dateTime: this.formatDateTime(verificationLog.checked_at),
      result: verificationLog.result_summary || 'Verification check recorded',
    };
  }
}
