import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import {
  Application,
  ApplicationStatus,
  LandDetail,
  Payment,
  User,
  WorkflowType,
} from '../../models/api.models';

type AdminApplicationStatus = string;

interface SubmittedApplication {
  applicationId: number;
  reference: string;
  applicant: string;
  workflowType: string;
  parcelNumber: string;
  submittedDate: string;
  assignedOfficer: string;
  paymentStatus: string;
  status: AdminApplicationStatus;
}

@Component({
  selector: 'app-admin-applications',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-applications.html',
  styleUrl: './admin-applications.css',
})
export class AdminApplications {
  adminName: string = 'Administrator';
  isLoading: boolean = false;
  errorMessage: string = '';

  selectedWorkflow: string = 'All';
  selectedStatus: string = 'All';
  searchTerm: string = '';
  selectedApplicationForReview: SubmittedApplication | null = null;
  selectedReviewStatusId: number | null = null;
  reviewComment: string = '';
  reviewMessage: string = '';
  reviewMessageType: 'success' | 'error' | '' = '';
  isSubmittingReview: boolean = false;
  currentAdminId: number = 0;

  workflowOptions: string[] = ['All'];
  statusOptions: string[] = ['All'];
  reviewStatusOptions: ApplicationStatus[] = [];
  applications: SubmittedApplication[] = [];

  constructor(private apiService: ApiService, private authService: AuthService) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.currentAdminId = currentUser?.user_id || 0;
    this.adminName = currentUser?.full_name || this.adminName;
    this.loadApplications();
  }

  loadApplications(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      applications: this.apiService.getApplications(),
      statuses: this.apiService.getApplicationStatuses(),
      workflowTypes: this.apiService.getWorkflowTypes(),
      users: this.apiService.getUsers(),
      landDetails: this.apiService.getLandDetails(),
      payments: this.apiService.getPayments(),
    }).subscribe({
      next: ({ applications, statuses, workflowTypes, users, landDetails, payments }) => {
        this.workflowOptions = [
          'All',
          ...workflowTypes.map((workflow) => workflow.workflow_name),
        ];
        this.statusOptions = [
          'All',
          ...statuses.map((status) => status.status_name),
        ];
        this.reviewStatusOptions = statuses.filter((status) =>
          ['queried', 'approved', 'rejected'].includes(status.status_name.toLowerCase())
        );
        this.applications = applications
          .slice()
          .sort(
            (a, b) =>
              new Date(b.submitted_at).getTime() -
              new Date(a.submitted_at).getTime()
          )
          .map((application) =>
            this.mapApplication(
              application,
              statuses,
              workflowTypes,
              users,
              landDetails,
              payments
            )
          );
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load admin applications:', error);
        this.errorMessage = 'Unable to load submitted applications from the server.';
        this.isLoading = false;
      },
    });
  }

  mapApplication(
    application: Application,
    statuses: ApplicationStatus[],
    workflowTypes: WorkflowType[],
    users: User[],
    landDetails: LandDetail[],
    payments: Payment[]
  ): SubmittedApplication {
    const applicant =
      users.find((user) => user.user_id === application.user)?.full_name ||
      `User #${application.user}`;
    const workflowType =
      workflowTypes.find(
        (workflow) => workflow.workflow_type_id === application.workflow_type
      )?.workflow_name || 'Unknown Workflow';
    const status =
      statuses.find((item) => item.status_id === application.status)?.status_name ||
      'Submitted';
    const landDetail = landDetails.find(
      (item) => item.application === application.application_id
    );
    const payment = payments.find(
      (item) => item.application === application.application_id
    );
    const reviewer =
      application.reviewed_by !== null
        ? users.find((user) => user.user_id === application.reviewed_by)?.full_name
        : null;

    return {
      applicationId: application.application_id,
      reference: application.application_code,
      applicant,
      workflowType,
      parcelNumber: landDetail?.parcel_number || 'Not provided',
      submittedDate: this.formatDate(application.submitted_at),
      assignedOfficer: reviewer || 'Unassigned',
      paymentStatus: payment?.payment_status || 'Not Required',
      status,
    };
  }

  get filteredApplications(): SubmittedApplication[] {
    const normalizedSearch = this.searchTerm.trim().toLowerCase();

    return this.applications.filter((application) => {
      const matchesSearch =
        !normalizedSearch ||
        application.reference.toLowerCase().includes(normalizedSearch) ||
        application.applicant.toLowerCase().includes(normalizedSearch) ||
        application.parcelNumber.toLowerCase().includes(normalizedSearch);

      const matchesWorkflow =
        this.selectedWorkflow === 'All' ||
        application.workflowType === this.selectedWorkflow;

      const matchesStatus =
        this.selectedStatus === 'All' || application.status === this.selectedStatus;

      return matchesSearch && matchesWorkflow && matchesStatus;
    });
  }

  get totalApplications(): number {
    return this.applications.length;
  }

  get pendingReviewCount(): number {
    return this.applications.filter((application) =>
      ['Submitted', 'Pending Review', 'Queried'].includes(application.status)
    ).length;
  }

  get flaggedCount(): number {
    return this.applications.filter((application) =>
      application.status.toLowerCase().includes('flag')
    )
      .length;
  }

  get completedCount(): number {
    return this.applications.filter((application) =>
      ['Approved', 'Registered', 'Completed'].includes(application.status)
    )
      .length;
  }

  getStatusBadgeClass(status: AdminApplicationStatus): string {
    const normalizedStatus = status.toLowerCase();

    if (['approved', 'registered', 'completed'].includes(normalizedStatus)) {
      return 'bg-green-100 text-green-800';
    }

    if (['submitted', 'pending review', 'draft'].includes(normalizedStatus)) {
      return 'bg-amber-100 text-amber-800';
    }

    if (normalizedStatus === 'queried') {
      return 'bg-purple-100 text-purple-800';
    }

    if (normalizedStatus === 'rejected' || normalizedStatus.includes('flag')) {
      return 'bg-red-100 text-red-800';
    }

    return 'bg-gray-100 text-gray-700';
  }

  getPaymentBadgeClass(status: string): string {
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

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedWorkflow = 'All';
    this.selectedStatus = 'All';
  }

  selectApplicationForReview(application: SubmittedApplication): void {
    this.selectedApplicationForReview = application;
    this.reviewComment = '';
    this.reviewMessage = '';
    this.reviewMessageType = '';
    this.selectedReviewStatusId =
      this.reviewStatusOptions.find(
        (status) => status.status_name.toLowerCase() === application.status.toLowerCase()
      )?.status_id || null;
    localStorage.setItem('adminReviewApplicationId', String(application.applicationId));
  }

  submitReview(): void {
    if (!this.selectedApplicationForReview) {
      this.reviewMessage = 'Select an application before submitting a review.';
      this.reviewMessageType = 'error';
      return;
    }

    if (!this.currentAdminId) {
      this.reviewMessage = 'Your admin login session could not be found. Please sign in again.';
      this.reviewMessageType = 'error';
      return;
    }

    if (!this.selectedReviewStatusId) {
      this.reviewMessage = 'Choose Queried, Approved, or Rejected before submitting.';
      this.reviewMessageType = 'error';
      return;
    }

    if (!this.reviewComment.trim()) {
      this.reviewMessage = 'Enter a review comment before submitting.';
      this.reviewMessageType = 'error';
      return;
    }

    this.isSubmittingReview = true;

    this.apiService.reviewApplication(this.selectedApplicationForReview.applicationId, {
      admin_id: this.currentAdminId,
      new_status_id: this.selectedReviewStatusId,
      comment: this.reviewComment,
    }).subscribe({
      next: () => {
        this.reviewMessage = `Review submitted for ${this.selectedApplicationForReview?.reference}.`;
        this.reviewMessageType = 'success';
        this.isSubmittingReview = false;
        this.refreshAfterReview();
      },
      error: (error) => {
        console.error('Failed to submit application review:', error);
        this.reviewMessage = 'Unable to submit application review. Please try again.';
        this.reviewMessageType = 'error';
        this.isSubmittingReview = false;
      },
    });
  }

  refreshAfterReview(): void {
    forkJoin({
      applications: this.apiService.getApplications(),
      reviewLogs: this.apiService.getReviewLogs(),
      notifications: this.apiService.getNotifications(),
      auditLogs: this.apiService.getAuditLogs(),
    }).subscribe({
      next: () => this.loadApplications(),
      error: (error) => {
        console.error('Review submitted, but refresh failed:', error);
        this.loadApplications();
      },
    });
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString();
  }
}
