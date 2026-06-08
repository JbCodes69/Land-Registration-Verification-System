import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import {
  Application,
  ApplicationStatus as BackendApplicationStatus,
  Payment,
  WorkflowType,
} from '../../models/api.models';

type ApplicationStatusValue = string;
type PaymentStatusValue = string;

interface LandApplication {
  reference: string;
  workflowType: string;
  dateSubmitted: string;
  currentStatus: ApplicationStatusValue;
  adminRemark: string;
  paymentStatus: PaymentStatusValue;
}

@Component({
  selector: 'app-application-status',
  imports: [CommonModule, RouterLink],
  templateUrl: './application-status.html',
  styleUrl: './application-status.css',
})
export class ApplicationStatus {
  userName: string = 'User';
  currentUserId: number = 0;
  isLoading: boolean = false;
  errorMessage: string = '';

  currentApplication: LandApplication | null = null;
  recentApplications: LandApplication[] = [];

  constructor(private apiService: ApiService, private authService: AuthService) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.currentUserId = currentUser?.user_id || 0;
    this.userName = currentUser?.full_name || this.userName;
    this.loadApplicationStatusData();
  }

  loadApplicationStatusData(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      applications: this.apiService.getApplications(),
      statuses: this.apiService.getApplicationStatuses(),
      workflowTypes: this.apiService.getWorkflowTypes(),
      payments: this.apiService.getPayments(),
    }).subscribe({
      next: ({ applications, statuses, workflowTypes, payments }) => {
        const userApplications = applications
          .filter((application) => application.user === this.currentUserId)
          .sort(
            (a, b) =>
              new Date(b.submitted_at).getTime() -
              new Date(a.submitted_at).getTime()
          );

        this.recentApplications = userApplications.map((application) =>
          this.mapApplication(application, statuses, workflowTypes, payments)
        );

        if (this.recentApplications.length > 0) {
          this.currentApplication = this.recentApplications[0];
        }

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load application status data:', error);
        this.errorMessage = 'Unable to load application status data from the server.';
        this.isLoading = false;
      },
    });
  }

  mapApplication(
    application: Application,
    statuses: BackendApplicationStatus[],
    workflowTypes: WorkflowType[],
    payments: Payment[]
  ): LandApplication {
    const statusName =
      statuses.find((status) => status.status_id === application.status)
        ?.status_name || 'Submitted';
    const workflowName =
      workflowTypes.find(
        (workflow) => workflow.workflow_type_id === application.workflow_type
      )?.workflow_name || 'Unknown Workflow';
    const payment = payments.find(
      (paymentRecord) => paymentRecord.application === application.application_id
    );

    return {
      reference: application.application_code,
      workflowType: workflowName,
      dateSubmitted: this.formatDate(application.submitted_at),
      currentStatus: statusName,
      adminRemark: application.remarks || 'No admin remark has been recorded yet.',
      paymentStatus: payment?.payment_status || 'Not Required',
    };
  }

  getStatusBadgeClass(status: ApplicationStatusValue): string {
    const normalizedStatus = status.toLowerCase();

    if (['approved', 'registered', 'completed'].includes(normalizedStatus)) {
      return 'bg-green-100 text-green-800';
    }

    if (['submitted', 'pending review', 'under review', 'draft'].includes(normalizedStatus)) {
      return 'bg-amber-100 text-amber-800';
    }

    if (normalizedStatus === 'queried') {
      return 'bg-purple-100 text-purple-800';
    }

    if (normalizedStatus === 'rejected') {
      return 'bg-red-100 text-red-800';
    }

    return 'bg-gray-100 text-gray-700';
  }

  getPaymentBadgeClass(status: PaymentStatusValue): string {
    const normalizedStatus = status.toLowerCase();

    if (['completed', 'successful', 'success'].includes(normalizedStatus)) {
      return 'bg-green-100 text-green-800';
    }

    if (['pending', 'pending payment'].includes(normalizedStatus)) {
      return 'bg-amber-100 text-amber-800';
    }

    if (['failed', 'declined'].includes(normalizedStatus)) {
      return 'bg-red-100 text-red-800';
    }

    return 'bg-gray-100 text-gray-700';
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString();
  }
}
