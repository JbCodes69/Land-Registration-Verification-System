import { Injectable } from '@angular/core';
import { DocumentRecord, Payment } from '../models/api.models';
import { AppNotificationService } from './app-notification.service';

export interface ApplicationDraftFormData {
  applicantFullName: string;
  phoneNumber: string;
  emailAddress: string;
  partyName: string;
  partyRole: string;
  partyAddress: string;
  propertyLocation: string;
  landSize: string;
  parcelNumber: string;
  plotNumber: string;
  sitePlanNumber: string;
  landDescription: string;
  instrumentType: string;
  instrumentDate: string;
  ownerNameOnDocument: string;
  taxClearanceNumber: string;
  ownershipType: string;
  currentOwner: string;
  newOwner: string;
  transferReason: string;
  consentPurpose: string;
  concurrencePurpose: string;
  titleNumber: string;
  declarationAccepted: boolean;
}

export interface ApplicationDraft {
  selectedWorkflow: string;
  selectedWorkflowLabel: string;
  selectedWorkflowTypeId: number | null;
  currentApplicationId: number | null;
  currentApplicationCode: string;
  currentLandDetailId: number | null;
  applicationFormData: ApplicationDraftFormData | null;
  uploadedDocumentData: Record<string, string>;
  uploadedDocumentRecords: DocumentRecord[];
  currentPayment: Payment | null;
  applicationSubmissionStatus: string;
}

@Injectable({
  providedIn: 'root',
})
export class ApplicationDraftService {
  readonly discardWarningMessage =
    'You have an application in progress. Going back will discard the current application. Do you want to continue?';

  private readonly draftKey = 'applicationDraft';

  private readonly mirrorKeys = [
    'selectedWorkflow',
    'selectedWorkflowLabel',
    'selectedWorkflowTypeId',
    'currentApplicationId',
    'currentApplicationCode',
    'currentLandDetailId',
    'applicationFormData',
    'uploadedDocumentData',
    'uploadedDocumentRecords',
    'currentPayment',
    'applicationSubmissionStatus',
    'applicationDraftStatus',
  ];

  constructor(private appNotificationService: AppNotificationService) {}

  getDraft(): ApplicationDraft {
    const storedDraft = this.readJson<ApplicationDraft>(sessionStorage.getItem(this.draftKey));

    return {
      selectedWorkflow:
        storedDraft?.selectedWorkflow || localStorage.getItem('selectedWorkflow') || '',
      selectedWorkflowLabel:
        storedDraft?.selectedWorkflowLabel || localStorage.getItem('selectedWorkflowLabel') || '',
      selectedWorkflowTypeId:
        storedDraft?.selectedWorkflowTypeId ??
        this.readNumber(localStorage.getItem('selectedWorkflowTypeId')),
      currentApplicationId:
        storedDraft?.currentApplicationId ??
        this.readNumber(localStorage.getItem('currentApplicationId')),
      currentApplicationCode:
        storedDraft?.currentApplicationCode ||
        localStorage.getItem('currentApplicationCode') ||
        '',
      currentLandDetailId:
        storedDraft?.currentLandDetailId ??
        this.readNumber(localStorage.getItem('currentLandDetailId')),
      applicationFormData:
        storedDraft?.applicationFormData ||
        this.readJson<ApplicationDraftFormData>(localStorage.getItem('applicationFormData')),
      uploadedDocumentData:
        storedDraft?.uploadedDocumentData ||
        this.readJson<Record<string, string>>(localStorage.getItem('uploadedDocumentData')) ||
        {},
      uploadedDocumentRecords:
        storedDraft?.uploadedDocumentRecords ||
        this.readJson<DocumentRecord[]>(localStorage.getItem('uploadedDocumentRecords')) ||
        [],
      currentPayment:
        storedDraft?.currentPayment ||
        this.readJson<Payment>(localStorage.getItem('currentPayment')),
      applicationSubmissionStatus:
        storedDraft?.applicationSubmissionStatus ||
        localStorage.getItem('applicationSubmissionStatus') ||
        '',
    };
  }

  updateDraft(changes: Partial<ApplicationDraft>): ApplicationDraft {
    const nextDraft = {
      ...this.getDraft(),
      ...changes,
    };

    sessionStorage.setItem(this.draftKey, JSON.stringify(nextDraft));
    this.mirrorDraft(nextDraft);

    return nextDraft;
  }

  clearDraft(): void {
    sessionStorage.removeItem(this.draftKey);
    this.mirrorKeys.forEach((key) => localStorage.removeItem(key));
  }

  hasInProgressDraft(): boolean {
    const draft = this.getDraft();

    return (
      draft.applicationSubmissionStatus !== 'submitted' &&
      (
        !!draft.selectedWorkflow ||
        !!draft.currentApplicationId ||
        !!draft.currentApplicationCode ||
        !!draft.currentLandDetailId ||
        !!draft.applicationFormData ||
        Object.values(draft.uploadedDocumentData).some(Boolean) ||
        draft.uploadedDocumentRecords.length > 0 ||
        !!draft.currentPayment
      )
    );
  }

  async confirmDiscardInProgress(): Promise<boolean> {
    if (!this.hasInProgressDraft()) {
      return true;
    }

    const confirmed = await this.appNotificationService.confirm(
      this.discardWarningMessage,
      'Discard application draft?',
      'Continue',
      'Cancel'
    );

    if (confirmed) {
      this.clearDraft();
    }

    return confirmed;
  }

  clearApplicationFormData(): ApplicationDraft {
    return this.updateDraft({ applicationFormData: null });
  }

  clearUploadedDocuments(): ApplicationDraft {
    return this.updateDraft({
      uploadedDocumentData: {},
      uploadedDocumentRecords: [],
    });
  }

  private mirrorDraft(draft: ApplicationDraft): void {
    this.writeMirrorValue('selectedWorkflow', draft.selectedWorkflow);
    this.writeMirrorValue('selectedWorkflowLabel', draft.selectedWorkflowLabel);
    this.writeMirrorValue('selectedWorkflowTypeId', draft.selectedWorkflowTypeId);
    this.writeMirrorValue('currentApplicationId', draft.currentApplicationId);
    this.writeMirrorValue('currentApplicationCode', draft.currentApplicationCode);
    this.writeMirrorValue('currentLandDetailId', draft.currentLandDetailId);
    this.writeMirrorJson('applicationFormData', draft.applicationFormData);
    this.writeMirrorJson('uploadedDocumentData', draft.uploadedDocumentData);
    this.writeMirrorJson('uploadedDocumentRecords', draft.uploadedDocumentRecords);
    this.writeMirrorJson('currentPayment', draft.currentPayment);
    this.writeMirrorValue('applicationSubmissionStatus', draft.applicationSubmissionStatus);
  }

  private writeMirrorValue(key: string, value: string | number | null): void {
    if (value === null || value === '') {
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, String(value));
  }

  private writeMirrorJson(key: string, value: unknown): void {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, JSON.stringify(value));
  }

  private readJson<T>(value: string | null): T | null {
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  private readNumber(value: string | null): number | null {
    const parsedValue = Number(value || 0);
    return parsedValue > 0 ? parsedValue : null;
  }
}
