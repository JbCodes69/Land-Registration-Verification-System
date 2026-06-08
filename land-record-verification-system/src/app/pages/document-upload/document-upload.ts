import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ApplicationDraftService } from '../../services/application-draft.service';
import {
  DocumentRequirementSlot,
  WorkflowRequirementsService,
} from '../../services/workflow-requirements.service';
import { DocumentCategory } from '../../models/api.models';

@Component({
  selector: 'app-document-upload',
  imports: [CommonModule, RouterLink],
  templateUrl: './document-upload.html',
  styleUrl: './document-upload.css',
})
export class DocumentUpload {
  // Placeholder user data for documentation/demo UI
  userName: string = 'User';

  // UI feedback message state
  message: string = '';
  messageType: 'success' | 'error' | '' = '';
  isLoadingCategories: boolean = false;
  isSubmitting: boolean = false;

  // Workflow info
  selectedWorkflow: string = '';
  selectedWorkflowLabel: string = '';
  applicationReference: string = 'Not provided';
  currentApplicationId: number | null = null;
  currentUserId: number = 0;
  documentCategories: DocumentCategory[] = [];
  documentRequirementSlots: DocumentRequirementSlot[] = [];

  uploadedDocuments: Record<string, string> = {};
  selectedFiles: Record<string, File> = {};

  constructor(
    private router: Router,
    private apiService: ApiService,
    private authService: AuthService,
    private applicationDraftService: ApplicationDraftService,
    private workflowRequirementsService: WorkflowRequirementsService
  ) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      this.userName = currentUser.full_name;
      this.currentUserId = currentUser.user_id;
    }

    const draft = this.applicationDraftService.getDraft();

    this.selectedWorkflow = draft.selectedWorkflow;
    this.selectedWorkflowLabel = draft.selectedWorkflowLabel;
    this.applicationReference = draft.currentApplicationCode || this.applicationReference;
    this.currentApplicationId = draft.currentApplicationId;
    this.uploadedDocuments = { ...draft.uploadedDocumentData };

    this.loadDocumentCategories();

    if (!this.selectedWorkflow) {
      this.showError('Please select a workflow and complete the application form first.');
    }

    if (!this.currentApplicationId) {
      this.showError('No submitted application was found. Please complete the application form first.');
    }

    if (!this.currentUserId) {
      this.showError('Your login session could not be found. Please sign in again.');
    }
  }

  loadDocumentCategories(): void {
    this.isLoadingCategories = true;

    this.apiService.getDocumentCategories().subscribe({
      next: (categories) => {
        this.documentCategories = categories;
        this.documentRequirementSlots = this.workflowRequirementsService.getDocumentSlots(
          this.selectedWorkflowLabel || this.selectedWorkflow,
          categories
        );
        this.isLoadingCategories = false;
      },
      error: (error) => {
        this.isLoadingCategories = false;
        if (error?.status !== 401 && error?.status !== 400) {
          console.error('Failed to load document categories:', error);
        }
        this.showError(this.getBackendErrorMessage(error));
      },
    });
  }

  // Clears any previous message
  clearMessage(): void {
    this.message = '';
    this.messageType = '';
  }

  // Shows error message
  showError(message: string): void {
    this.message = message;
    this.messageType = 'error';
  }

  // Shows success message
  showSuccess(message: string): void {
    this.message = message;
    this.messageType = 'success';
  }

  getBackendErrorMessage(error: any): string {
    if (error?.status === 401) {
      return 'Your session has expired. Please log in again.';
    }

    const backendError = error?.error || error;

    if (typeof backendError === 'string') {
      return backendError;
    }

    if (backendError?.detail) {
      return String(backendError.detail);
    }

    if (backendError?.message) {
      return String(backendError.message);
    }

    if (backendError && typeof backendError === 'object') {
      const firstError = Object.values(backendError).find(Boolean);

      if (Array.isArray(firstError)) {
        return String(firstError[0]);
      }

      if (firstError) {
        return String(firstError);
      }
    }

    return 'Unable to upload documents to the server. Please try again.';
  }

  // Handles file selection and keeps the actual File for multipart upload
  handleFileSelection(event: Event, slotKey: string): void {
    this.clearMessage();

    const inputElement = event.target as HTMLInputElement;

    if (!inputElement.files || inputElement.files.length === 0) {
      delete this.uploadedDocuments[slotKey];
      delete this.selectedFiles[slotKey];
      return;
    }

    const selectedFile = inputElement.files[0];
    this.uploadedDocuments[slotKey] = selectedFile.name;
    this.selectedFiles[slotKey] = selectedFile;
    this.saveDocumentDraft();
  }

  getSelectedDocumentEntries(): Array<[string, string]> {
    return Object.entries(this.uploadedDocuments).filter(
      (entry): entry is [string, string] => !!entry[1]
    );
  }

  getSlotLabel(slotKey: string): string {
    return (
      this.documentRequirementSlots.find((slot) => slot.key === slotKey)?.label ||
      'Document'
    );
  }

  getSlotCategoryId(slot: DocumentRequirementSlot): number {
    return (
      slot.category?.document_category_id ||
      this.documentCategories[0]?.document_category_id ||
      0
    );
  }

  buildDocumentFormData(slot: DocumentRequirementSlot, file: File): FormData {
    const formData = new FormData();

    formData.append('application_id', String(this.currentApplicationId || 0));
    formData.append('document_category_id', String(this.getSlotCategoryId(slot)));
    formData.append('uploaded_by', String(this.currentUserId));
    formData.append('document_name', `${slot.label}: ${file.name}`);
    formData.append('file', file);

    return formData;
  }

  validateUploads(): boolean {
    if (!this.currentApplicationId) {
      this.showError('No application ID was found. Please return to the application form and submit again.');
      return false;
    }

    if (!this.currentUserId) {
      this.showError('Your login session could not be found. Please sign in again.');
      return false;
    }

    if (
      this.documentCategories.length === 0 &&
      this.documentRequirementSlots.some((slot) => slot.required)
    ) {
      this.showError('No document categories configured.');
      return false;
    }

    const missingRequiredDocument = this.documentRequirementSlots.find(
      (slot) => slot.required && !this.uploadedDocuments[slot.key]
    );

    if (missingRequiredDocument) {
      this.showError(`${missingRequiredDocument.label} is required for ${this.selectedWorkflowLabel || 'this workflow'}.`);
      return false;
    }

    return true;
  }

  resetUploads(): void {
    this.clearMessage();

    const confirmed = window.confirm(
      'Discard the current document upload draft? This will clear saved document selections for this application.'
    );

    if (!confirmed) {
      return;
    }

    this.uploadedDocuments = {};
    this.selectedFiles = {};
    this.applicationDraftService.clearUploadedDocuments();

    this.showSuccess('Uploaded document selections have been reset.');
  }

  saveDocumentDraft(): void {
    this.applicationDraftService.updateDraft({
      selectedWorkflow: this.selectedWorkflow,
      selectedWorkflowLabel: this.selectedWorkflowLabel,
      currentApplicationId: this.currentApplicationId,
      currentApplicationCode: this.applicationReference,
      uploadedDocumentData: this.uploadedDocuments,
    });
  }

  // Uploads selected document files and proceeds to the summary page
  saveAndContinue(): void {
    this.clearMessage();

    if (!this.validateUploads()) {
      return;
    }

    const selectedDocuments = this.documentRequirementSlots.filter(
      (slot) => !!this.selectedFiles[slot.key]
    );

    if (selectedDocuments.length === 0) {
      this.saveDocumentDraft();
      this.showSuccess('Document selections saved successfully.');
      this.router.navigate(['/payment']);
      return;
    }

    if (this.documentCategories.length === 0) {
      this.showError('Document categories are not configured, so selected files cannot be uploaded yet.');
      return;
    }

    const documentRequests = selectedDocuments.map((slot) =>
      this.apiService.uploadDocument(
        this.buildDocumentFormData(slot, this.selectedFiles[slot.key])
      )
    );

    this.isSubmitting = true;

    forkJoin(documentRequests).subscribe({
      next: (createdDocuments) => {
        const uploadedDocumentData = createdDocuments.reduce<Record<string, string>>(
          (documentsByCategory, document, index) => {
            const slot = selectedDocuments[index];
            const fileUrl = document.file_url || document.file_path || '';

            if (slot && fileUrl) {
              documentsByCategory[slot.key] = fileUrl;
            }

            return documentsByCategory;
          },
          {}
        );

        this.uploadedDocuments = {
          ...this.uploadedDocuments,
          ...uploadedDocumentData,
        };
        this.applicationDraftService.updateDraft({
          uploadedDocumentData: this.uploadedDocuments,
          uploadedDocumentRecords: createdDocuments,
        });

        this.apiService.getDocuments().subscribe({
          next: (documents) => {
            this.isSubmitting = false;
            this.showSuccess('Documents uploaded successfully.');
            this.router.navigate(['/payment']);
          },
          error: (refreshError) => {
            console.error('Documents saved, but refresh failed:', refreshError);
            this.isSubmitting = false;
            this.showSuccess('Documents uploaded successfully.');
            this.router.navigate(['/payment']);
          },
        });
      },
      error: (error) => {
        if (error?.status !== 401 && error?.status !== 400) {
          console.error('Failed to upload documents:', error);
        }
        this.isSubmitting = false;
        this.showError(this.getBackendErrorMessage(error));
      },
    });
  }
}
