import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ApplicationDraftService } from '../../services/application-draft.service';
import { WorkflowRequirementsService } from '../../services/workflow-requirements.service';
import {
  Application,
  ApplicationStatus,
  DocumentRecord,
  LandDetail,
  Payment,
} from '../../models/api.models';

@Component({
  selector: 'app-application-summary',
  imports: [CommonModule, RouterLink],
  templateUrl: './application-summary.html',
  styleUrl: './application-summary.css',
})
export class ApplicationSummary {
  isSidebarOpen: boolean = false;
  private readonly backendBaseUrl = 'http://127.0.0.1:8000';

  // Placeholder user data for documentation/demo UI
  userName: string = 'User';

  // UI feedback message state
  message: string = '';
  messageType: 'success' | 'error' | '' = '';
  isLoading: boolean = false;
  isSubmitting: boolean = false;

  // Workflow and application context
  selectedWorkflow: string = '';
  selectedWorkflowLabel: string = '';
  applicationReference: string = 'Not provided';
  currentApplicationId: number | null = null;
  currentApplication: Application | null = null;
  currentLandDetail: LandDetail | null = null;
  currentDocuments: DocumentRecord[] = [];
  currentPayment: Payment | null = null;
  applicationStatuses: ApplicationStatus[] = [];
  applicationStatusName: string = 'Pending Submission';

  // Data loaded from localStorage for now
  applicationFormData: any = {};
  uploadedDocumentData: any = {};

  hasApplicationData: boolean = false;
  hasDocumentData: boolean = false;

  constructor(
    private router: Router,
    private apiService: ApiService,
    private authService: AuthService,
    private applicationDraftService: ApplicationDraftService,
    private workflowRequirementsService: WorkflowRequirementsService
  ) {}

  ngOnInit(): void {
    this.userName = this.authService.getCurrentUser()?.full_name || this.userName;
    const draft = this.applicationDraftService.getDraft();

    this.selectedWorkflow = draft.selectedWorkflow;
    this.selectedWorkflowLabel = draft.selectedWorkflowLabel;
    this.applicationReference = draft.currentApplicationCode || this.applicationReference;
    this.currentApplicationId = draft.currentApplicationId;
    this.applicationFormData = draft.applicationFormData || {};
    this.uploadedDocumentData = draft.uploadedDocumentData || {};
    this.currentPayment = draft.currentPayment;

    this.hasApplicationData = !!draft.applicationFormData;
    this.hasDocumentData = Object.values(this.uploadedDocumentData).some(Boolean);

    if (!this.selectedWorkflow) {
      this.showError('No land service selected. Please return and choose a land service.');
    }

    if (this.currentApplicationId) {
      this.loadApplicationSummary();
    }
  }

  loadApplicationSummary(): void {
    if (!this.currentApplicationId) {
      return;
    }

    this.isLoading = true;

    forkJoin({
      application: this.apiService.getApplication(this.currentApplicationId),
      landDetails: this.apiService.getLandDetails(),
      documents: this.apiService.getDocuments(),
      payments: this.apiService.getPayments(),
      statuses: this.apiService.getApplicationStatuses(),
    }).subscribe({
      next: ({ application, landDetails, documents, payments, statuses }) => {
        this.currentApplication = application;
        this.currentLandDetail =
          landDetails.find(
            (landDetail) => landDetail.application === application.application_id
          ) || null;
        this.currentDocuments = documents.filter(
          (document) => this.getDocumentApplicationId(document) === application.application_id
        );
        this.currentPayment =
          payments.find(
            (payment) =>
              this.getPaymentApplicationId(payment) === application.application_id &&
              this.isSuccessfulPayment(payment)
          ) ||
          payments.find(
            (payment) => this.getPaymentApplicationId(payment) === application.application_id
          ) ||
          null;
        this.applicationStatuses = statuses;
        this.applicationReference = application.application_code;
        this.applicationStatusName =
          statuses.find((status) => status.status_id === application.status)
            ?.status_name || 'Submitted';

        this.mergeBackendLandDetails();
        this.applicationDraftService.updateDraft({
          currentApplicationId: application.application_id,
          currentApplicationCode: application.application_code,
          currentLandDetailId: this.currentLandDetail?.land_detail_id || null,
          applicationFormData: this.applicationFormData,
          uploadedDocumentData: this.uploadedDocumentData,
          currentPayment: this.currentPayment,
        });
        this.hasApplicationData = true;
        this.hasDocumentData =
          this.currentDocuments.length > 0 || Object.values(this.uploadedDocumentData).some(Boolean);
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load application summary.');
        this.isLoading = false;
        this.showError('Unable to load the latest application summary from the server.');
      },
    });
  }

  mergeBackendLandDetails(): void {
    if (!this.currentLandDetail) {
      return;
    }

    this.applicationFormData = {
      ...this.applicationFormData,
      propertyLocation: this.currentLandDetail.property_location,
      landSize: this.currentLandDetail.land_size,
      parcelNumber: this.currentLandDetail.parcel_number,
      plotNumber: this.currentLandDetail.plot_number,
      sitePlanNumber: this.currentLandDetail.site_plan_number,
      landDescription: this.currentLandDetail.land_description,
      instrumentType: this.currentLandDetail.instrument_type,
      instrumentDate: this.currentLandDetail.instrument_date,
    };
  }

  // Builds a clean document display list for the template
  get documentSummaryItems() {
    if (this.currentDocuments.length > 0) {
      return this.currentDocuments.map((document) => ({
        label: document.document_name,
        value: document.verification_status,
        fileUrl: this.resolveFileUrl(document.file_url || document.file_path || ''),
        isImage: this.isImageFile(document.file_url || document.file_path || document.document_name),
      }));
    }

    return Object.entries(this.uploadedDocumentData)
      .filter(([, value]) => !!value)
      .map(([categoryId, value]) => ({
        label: `Document category ${categoryId}`,
        value: 'Uploaded',
        fileUrl: this.resolveFileUrl(String(value)),
        isImage: this.isImageFile(String(value)),
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

  printPage(): void {
    window.print();
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString('en-GH', {
      timeZone: 'Africa/Accra',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  // Clears UI message
  clearMessage(): void {
    this.message = '';
    this.messageType = '';
  }

  // Shows error feedback
  showError(message: string): void {
    this.message = message;
    this.messageType = 'error';
  }

  // Shows success feedback
  showSuccess(message: string): void {
    this.message = message;
    this.messageType = 'success';
  }

  getDocumentApplicationId(document: DocumentRecord): number | null {
    return document.application_id || document.application || null;
  }

  getPaymentApplicationId(payment: Payment): number | null {
    return payment.application || payment.application_id || null;
  }

  isSuccessfulPayment(payment: Payment | null): boolean {
    return (payment?.payment_status || '').toLowerCase() === 'successful';
  }

  hasSuccessfulPayment(): boolean {
    return this.isSuccessfulPayment(this.currentPayment);
  }

  // Checks if all major sections are ready
  isReadyForSubmission(): boolean {
    return (
      !!this.selectedWorkflow &&
      this.hasApplicationData &&
      this.hasRequiredDocumentData() &&
      this.hasSuccessfulPayment()
    );
  }

  hasRequiredDocumentData(): boolean {
    const requirements = this.workflowRequirementsService.getRequirements(
      this.selectedWorkflowLabel || this.selectedWorkflow
    );

    const requiredDocuments = requirements.documents.filter((document) => document.required);

    if (requiredDocuments.length === 0) {
      return true;
    }

    return requiredDocuments.every((requiredDocument) => {
      const savedDocument = this.uploadedDocumentData[requiredDocument.key];
      const backendDocument = this.currentDocuments.some((document) =>
        document.document_name.toLowerCase().includes(requiredDocument.label.toLowerCase())
      );

      return !!savedDocument || backendDocument;
    });
  }

  // Saves a draft status for now
  saveDraft(): void {
    this.clearMessage();

    localStorage.setItem('applicationDraftStatus', 'saved');
    this.applicationDraftService.updateDraft({
      applicationFormData: this.applicationFormData,
      uploadedDocumentData: this.uploadedDocumentData,
      currentPayment: this.currentPayment,
    });
    this.showSuccess('Application draft saved successfully.');
  }

  // Final submission for current documentation/demo stage
  submitApplication(): void {
    this.clearMessage();

    if (!this.isReadyForSubmission()) {
      this.showError(
        this.hasSuccessfulPayment()
          ? 'Application is not ready for submission. Please complete all required stages.'
          : 'A successful payment is required before final submission.'
      );
      return;
    }

    if (!this.currentApplicationId) {
      this.showError('No application was found for final submission.');
      return;
    }

    this.isSubmitting = true;

    this.apiService.completeApplication(this.currentApplicationId).subscribe({
      next: () => {
        this.applicationDraftService.updateDraft({ applicationSubmissionStatus: 'submitted' });
        this.showSuccess('Application submitted successfully. Redirecting to Application Status.');
        this.isSubmitting = false;
        window.setTimeout(() => {
          this.router.navigate(['/application-status']).then((navigated) => {
            if (navigated) {
              this.applicationDraftService.clearDraft();
            }
          });
        }, 600);
      },
      error: (error) => {
        console.error('Failed to complete application.');
        this.isSubmitting = false;
        this.showError(
          error?.error?.detail ||
            'Unable to complete the application. Please confirm payment and try again.'
        );
      },
    });
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }
}
