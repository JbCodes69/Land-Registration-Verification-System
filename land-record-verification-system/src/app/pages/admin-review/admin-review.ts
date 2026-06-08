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
  DocumentCategory,
  DocumentRecord,
  LandDetail,
  Payment,
  User,
  WorkflowType,
} from '../../models/api.models';

type ReviewDecision = 'Queried' | 'Approved' | 'Rejected';
type DocumentReviewStatus =
  | 'Complete'
  | 'Incomplete'
  | 'Requires Correction'
  | 'Invalid';
type VerificationOutcome =
  | 'Verified'
  | 'Not Verified'
  | 'Disputed'
  | 'Pending Further Review';
type AdminRecommendation =
  | ''
  | 'Proceed'
  | 'Request Correction'
  | 'Reject Application'
  | 'Escalate for Further Review';
type ReviewStatus = string;

interface SubmittedDocument {
  category: string;
  fileName: string;
  fileUrl: string;
  isImage: boolean;
  uploadedDate: string;
  status: 'Submitted' | 'Needs Review' | 'Accepted';
}

@Component({
  selector: 'app-admin-review',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-review.html',
  styleUrl: './admin-review.css',
})
export class AdminReview {
  private readonly backendBaseUrl = 'http://127.0.0.1:8000';

  adminName: string = 'Administrator';
  adminUserId: number = 0;
  isLoading: boolean = false;
  isSubmittingDecision: boolean = false;

  adminRemark: string = '';
  selectedReviewDecision: ReviewDecision | '' = '';
  selectedDocumentReviewStatus: DocumentReviewStatus | '' = '';
  selectedVerificationOutcome: VerificationOutcome | '' = '';
  selectedAdminRecommendation: AdminRecommendation = '';
  decisionMessage: string = '';
  decisionMessageType: 'success' | 'error' | '' = '';
  selectedApplicationId: number | null = null;
  applicationStatuses: ApplicationStatus[] = [];

  reviewDecisionOptions: ReviewDecision[] = ['Queried', 'Approved', 'Rejected'];
  documentReviewStatusOptions: DocumentReviewStatus[] = [
    'Complete',
    'Incomplete',
    'Requires Correction',
    'Invalid',
  ];
  verificationOutcomeOptions: VerificationOutcome[] = [
    'Verified',
    'Not Verified',
    'Disputed',
    'Pending Further Review',
  ];
  adminRecommendationOptions: Exclude<AdminRecommendation, ''>[] = [
    'Proceed',
    'Request Correction',
    'Reject Application',
    'Escalate for Further Review',
  ];
  reviewCommentPlaceholder: string = [
    'Documents reviewed and found complete.',
    'Application queried due to missing or unclear supporting document.',
    'Application rejected due to inconsistent land details.',
    'Application approved after successful document and land record review.',
    'Land record requires further verification before approval.',
  ].join('\n');

  selectedApplication = {
    reference: 'Not provided',
    workflowType: 'Not provided',
    submittedDate: 'Not provided',
    currentStatus: 'Not provided' as ReviewStatus,
    paymentStatus: 'Not provided',
    applicantName: 'Not provided',
    applicantPhone: 'Not provided',
    applicantEmail: 'Not provided',
    applicantAddress: 'Not provided',
    parcelNumber: 'Not provided',
    plotNumber: 'Not provided',
    location: 'Not provided',
    landSize: 'Not provided',
    landUse: 'Not provided',
    instrumentType: 'Not provided',
    verificationStatus: 'Not provided',
    disputeWarning: 'Not provided',
  };

  submittedDocuments: SubmittedDocument[] = [];

  constructor(private apiService: ApiService, private authService: AuthService) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.adminUserId = currentUser?.user_id || 0;
    this.adminName = currentUser?.full_name || this.adminName;
    this.loadReviewApplication();
  }

  loadReviewApplication(): void {
    this.isLoading = true;
    this.decisionMessage = '';
    this.decisionMessageType = '';

    forkJoin({
      applications: this.apiService.getApplications(),
      statuses: this.apiService.getApplicationStatuses(),
      workflowTypes: this.apiService.getWorkflowTypes(),
      users: this.apiService.getUsers(),
      landDetails: this.apiService.getLandDetails(),
      documents: this.apiService.getDocuments(),
      documentCategories: this.apiService.getDocumentCategories(),
      payments: this.apiService.getPayments(),
    }).subscribe({
      next: ({
        applications,
        statuses,
        workflowTypes,
        users,
        landDetails,
        documents,
        documentCategories,
        payments,
      }) => {
        this.applicationStatuses = statuses;
        const selectedApplication =
          this.findSelectedApplication(applications, statuses) ||
          applications[0];

        if (!selectedApplication) {
          this.decisionMessage = 'No submitted applications are available for review.';
          this.decisionMessageType = 'error';
          this.isLoading = false;
          return;
        }

        this.selectedApplicationId = selectedApplication.application_id;
        this.mapSelectedApplication(
          selectedApplication,
          statuses,
          workflowTypes,
          users,
          landDetails,
          payments
        );
        this.mapSubmittedDocuments(
          selectedApplication.application_id,
          documents,
          documentCategories
        );
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load admin review data:', error);
        this.decisionMessage = 'Unable to load review data from the server.';
        this.decisionMessageType = 'error';
        this.isLoading = false;
      },
    });
  }

  findSelectedApplication(
    applications: Application[],
    statuses: ApplicationStatus[]
  ): Application | undefined {
    const storedApplicationId = Number(localStorage.getItem('adminReviewApplicationId') || 0);
    const currentApplicationId = Number(localStorage.getItem('currentApplicationId') || 0);
    const preferredId = storedApplicationId || currentApplicationId;

    if (preferredId) {
      const matchedApplication = applications.find(
        (application) => application.application_id === preferredId
      );

      if (matchedApplication) {
        return matchedApplication;
      }
    }

    return applications
      .slice()
      .sort(
        (a, b) =>
          new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      )
      .find((application) =>
        ['Submitted', 'Pending Review', 'Queried'].includes(
          this.getStatusName(application.status, statuses)
        )
      );
  }

  mapSelectedApplication(
    application: Application,
    statuses: ApplicationStatus[],
    workflowTypes: WorkflowType[],
    users: User[],
    landDetails: LandDetail[],
    payments: Payment[]
  ): void {
    const applicant = users.find((user) => user.user_id === application.user);
    const landDetail = landDetails.find(
      (item) => item.application === application.application_id
    );
    const payment = payments.find(
      (item) => item.application === application.application_id
    );

    this.selectedApplication = {
      reference: application.application_code,
      workflowType:
        workflowTypes.find(
          (workflow) => workflow.workflow_type_id === application.workflow_type
        )?.workflow_name || 'Unknown Workflow',
      submittedDate: this.formatDate(application.submitted_at),
      currentStatus: this.getStatusName(application.status, statuses),
      paymentStatus: payment?.payment_status || 'Not Required',
      applicantName: applicant?.full_name || `User #${application.user}`,
      applicantPhone: applicant?.phone_number || 'Not provided',
      applicantEmail: applicant?.email || 'Not provided',
      applicantAddress: 'Not provided by applicant profile',
      parcelNumber: landDetail?.parcel_number || 'Not provided',
      plotNumber: landDetail?.plot_number || 'Not provided',
      location: landDetail?.property_location || 'Not provided',
      landSize: landDetail?.land_size || 'Not provided',
      landUse: landDetail?.land_description || 'Not specified',
      instrumentType: landDetail?.instrument_type || 'Not provided',
      verificationStatus: landDetail?.is_disputed
        ? 'Disputed / Flagged'
        : landDetail?.is_already_registered
        ? 'Already Registered'
        : this.getStatusName(application.status, statuses),
      disputeWarning: landDetail?.is_disputed
        ? 'This parcel is marked as disputed in the backend and requires special review.'
        : 'No active dispute confirmed from backend land detail records.',
    };

    this.adminRemark = application.remarks || '';
  }

  mapSubmittedDocuments(
    applicationId: number,
    documents: DocumentRecord[],
    documentCategories: DocumentCategory[]
  ): void {
    const relatedDocuments = documents.filter(
      (document) => document.application === applicationId
    );

    this.submittedDocuments = relatedDocuments.map((document) => ({
      category:
        documentCategories.find(
          (category) =>
            category.document_category_id === document.document_category
        )?.category_name || document.document_name,
      fileName: document.document_name || this.getFileName(document.file_url || document.file_path || ''),
      fileUrl: this.resolveFileUrl(document.file_url || document.file_path || ''),
      isImage: this.isImageFile(document.file_url || document.file_path || document.document_name),
      uploadedDate: this.formatDate(document.upload_date),
      status:
        document.verification_status === 'Verified'
          ? 'Accepted'
          : document.verification_status === 'Rejected'
          ? 'Needs Review'
          : 'Submitted',
    }));
  }

  resolveFileUrl(fileUrl: string): string {
    if (!fileUrl) {
      return '';
    }

    if (/^https?:\/\//i.test(fileUrl)) {
      return fileUrl;
    }

    return `${this.backendBaseUrl}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
  }

  isImageFile(fileUrl: string): boolean {
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileUrl.split('?')[0]);
  }

  getFileName(fileUrl: string): string {
    return fileUrl.split('/').pop() || 'Uploaded document';
  }

  getStatusName(statusId: number, statuses: ApplicationStatus[]): string {
    return (
      statuses.find((status) => status.status_id === statusId)?.status_name ||
      'Pending Review'
    );
  }

  getStatusBadgeClass(status: ReviewStatus): string {
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

    return 'bg-red-100 text-red-800';
  }

  getDocumentBadgeClass(status: SubmittedDocument['status']): string {
    const statusClasses: Record<SubmittedDocument['status'], string> = {
      Submitted: 'bg-blue-100 text-blue-800',
      'Needs Review': 'bg-amber-100 text-amber-800',
      Accepted: 'bg-green-100 text-green-800',
    };

    return statusClasses[status];
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

  submitDecision(): void {
    if (!this.selectedReviewDecision) {
      this.decisionMessage = 'Select a review decision before submitting.';
      this.decisionMessageType = 'error';
      return;
    }

    if (!this.selectedDocumentReviewStatus) {
      this.decisionMessage = 'Select the document review status before submitting.';
      this.decisionMessageType = 'error';
      return;
    }

    if (!this.selectedVerificationOutcome) {
      this.decisionMessage = 'Select the verification outcome before submitting.';
      this.decisionMessageType = 'error';
      return;
    }

    if (!this.adminRemark.trim()) {
      this.decisionMessage = 'Enter a professional review comment before submitting.';
      this.decisionMessageType = 'error';
      return;
    }

    if (!this.selectedApplicationId) {
      this.decisionMessage = 'No backend application is selected for review.';
      this.decisionMessageType = 'error';
      return;
    }

    if (!this.adminUserId) {
      this.decisionMessage = 'Your admin login session could not be found. Please sign in again.';
      this.decisionMessageType = 'error';
      return;
    }

    const nextStatusName = this.selectedReviewDecision;
    const nextStatus = this.applicationStatuses.find(
      (status) => status.status_name === nextStatusName
    );

    if (!nextStatus) {
      this.decisionMessage = `${nextStatusName} status was not found in the backend status list.`;
      this.decisionMessageType = 'error';
      return;
    }

    this.isSubmittingDecision = true;

    this.apiService
      .reviewApplication(this.selectedApplicationId, {
        admin_id: this.adminUserId,
        new_status_id: nextStatus.status_id,
        comment: this.buildReviewComment(),
      })
      .subscribe({
        next: () => {
          this.selectedApplication.currentStatus = nextStatusName;
          this.decisionMessage = `${nextStatusName} decision recorded for ${this.selectedApplication.reference}.`;
          this.decisionMessageType = 'success';
          this.isSubmittingDecision = false;
          this.refreshReviewRelatedData();
        },
        error: (error) => {
          console.error('Failed to submit review decision:', error);
          this.decisionMessage =
            'Unable to save the review decision to the server. Please try again.';
          this.decisionMessageType = 'error';
          this.isSubmittingDecision = false;
        },
      });
  }

  buildReviewComment(): string {
    const recommendation = this.selectedAdminRecommendation || 'Not specified';

    return [
      `Review Decision: ${this.selectedReviewDecision}`,
      `Document Review Status: ${this.selectedDocumentReviewStatus}`,
      `Verification Outcome: ${this.selectedVerificationOutcome}`,
      `Admin Recommendation: ${recommendation}`,
      `Review Comment: ${this.adminRemark.trim()}`,
    ].join('\n');
  }

  refreshReviewRelatedData(): void {
    forkJoin({
      applications: this.apiService.getApplications(),
      reviewLogs: this.apiService.getReviewLogs(),
      notifications: this.apiService.getNotifications(),
      auditLogs: this.apiService.getAuditLogs(),
    }).subscribe({
      next: () => this.loadReviewApplication(),
      error: (error) => {
        console.error('Review saved, but refresh failed:', error);
      },
    });
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString();
  }
}
