import { Injectable } from '@angular/core';
import { DocumentCategory } from '../models/api.models';

export type WorkflowKey =
  | 'land-registration'
  | 'transfer-of-title'
  | 'consent'
  | 'concurrence'
  | 'land-verification'
  | 'default';

export interface FieldRequirement {
  key: string;
  label: string;
}

export interface AnyFieldRequirement {
  keys: string[];
  label: string;
}

export interface DocumentRequirement {
  key: string;
  label: string;
  required: boolean;
  categoryKeywords: string[];
}

export interface WorkflowRequirementSet {
  workflowKey: WorkflowKey;
  requiredFields: FieldRequirement[];
  anyOfFields?: AnyFieldRequirement;
  documents: DocumentRequirement[];
}

export interface DocumentRequirementSlot extends DocumentRequirement {
  category: DocumentCategory | null;
}

@Injectable({
  providedIn: 'root',
})
export class WorkflowRequirementsService {
  // Backend serializers are generic today, so these workflow rules are enforced in the frontend flow.
  private readonly requirements: Record<WorkflowKey, WorkflowRequirementSet> = {
    'land-registration': {
      workflowKey: 'land-registration',
      requiredFields: [
        { key: 'applicantFullName', label: 'Applicant name' },
        { key: 'propertyLocation', label: 'Land location' },
        { key: 'parcelNumber', label: 'Parcel number' },
        { key: 'landSize', label: 'Land size' },
        { key: 'ownershipType', label: 'Ownership type' },
      ],
      documents: [
        { key: 'site-plan', label: 'Site plan', required: true, categoryKeywords: ['site plan', 'survey'] },
        { key: 'proof-of-ownership', label: 'Proof of ownership', required: true, categoryKeywords: ['proof of ownership', 'ownership'] },
        { key: 'applicant-identification', label: 'Applicant identification', required: true, categoryKeywords: ['applicant identification', 'identification', 'id'] },
      ],
    },
    'transfer-of-title': {
      workflowKey: 'transfer-of-title',
      requiredFields: [
        { key: 'currentOwner', label: 'Current owner' },
        { key: 'newOwner', label: 'New owner' },
        { key: 'propertyLocation', label: 'Land location' },
        { key: 'parcelNumber', label: 'Parcel number' },
        { key: 'transferReason', label: 'Transfer reason' },
      ],
      documents: [
        { key: 'transfer-document', label: 'Transfer document', required: true, categoryKeywords: ['transfer'] },
        { key: 'proof-of-ownership', label: 'Proof of ownership', required: true, categoryKeywords: ['proof of ownership', 'ownership'] },
        { key: 'current-owner-identification', label: 'Current owner identification', required: true, categoryKeywords: ['current owner', 'identification', 'id'] },
        { key: 'new-owner-identification', label: 'New owner identification', required: true, categoryKeywords: ['new owner', 'identification', 'id'] },
      ],
    },
    consent: {
      workflowKey: 'consent',
      requiredFields: [
        { key: 'applicantFullName', label: 'Applicant name' },
        { key: 'propertyLocation', label: 'Land location' },
        { key: 'parcelNumber', label: 'Parcel number' },
        { key: 'consentPurpose', label: 'Consent purpose' },
      ],
      documents: [
        { key: 'consent-request-document', label: 'Consent request document', required: true, categoryKeywords: ['consent request', 'consent'] },
        { key: 'applicant-identification', label: 'Applicant identification', required: true, categoryKeywords: ['applicant identification', 'identification', 'id'] },
        { key: 'land-details-document', label: 'Land details document', required: true, categoryKeywords: ['land details', 'land detail'] },
      ],
    },
    concurrence: {
      workflowKey: 'concurrence',
      requiredFields: [
        { key: 'applicantFullName', label: 'Applicant name' },
        { key: 'propertyLocation', label: 'Land location' },
        { key: 'parcelNumber', label: 'Parcel number' },
        { key: 'concurrencePurpose', label: 'Concurrence purpose' },
      ],
      documents: [
        { key: 'concurrence-request-document', label: 'Concurrence request document', required: true, categoryKeywords: ['concurrence request', 'concurrence'] },
        { key: 'applicant-identification', label: 'Applicant identification', required: true, categoryKeywords: ['applicant identification', 'identification', 'id'] },
        { key: 'supporting-ownership-document', label: 'Supporting ownership document', required: true, categoryKeywords: ['supporting ownership', 'ownership'] },
      ],
    },
    'land-verification': {
      workflowKey: 'land-verification',
      requiredFields: [],
      anyOfFields: {
        keys: ['parcelNumber', 'titleNumber', 'propertyLocation'],
        label: 'Parcel number, title number, or location',
      },
      documents: [
        { key: 'supporting-reference-document', label: 'Supporting reference document', required: false, categoryKeywords: ['supporting reference', 'reference', 'supporting'] },
      ],
    },
    default: {
      workflowKey: 'default',
      requiredFields: [
        { key: 'applicantFullName', label: 'Applicant name' },
        { key: 'propertyLocation', label: 'Land location' },
        { key: 'parcelNumber', label: 'Parcel number' },
      ],
      documents: [],
    },
  };

  getRequirements(workflowNameOrValue: string): WorkflowRequirementSet {
    return this.requirements[this.getWorkflowKey(workflowNameOrValue)];
  }

  getWorkflowKey(workflowNameOrValue: string): WorkflowKey {
    const normalized = workflowNameOrValue.toLowerCase();

    if (normalized.includes('verification')) {
      return 'land-verification';
    }

    if (normalized.includes('transfer')) {
      return 'transfer-of-title';
    }

    if (normalized.includes('consent')) {
      return 'consent';
    }

    if (normalized.includes('concurrence')) {
      return 'concurrence';
    }

    if (normalized.includes('registration')) {
      return 'land-registration';
    }

    return 'default';
  }

  getDocumentSlots(
    workflowNameOrValue: string,
    categories: DocumentCategory[]
  ): DocumentRequirementSlot[] {
    return this.getRequirements(workflowNameOrValue).documents.map((requirement) => ({
      ...requirement,
      category: this.findCategory(requirement, categories),
    }));
  }

  isFieldRequired(workflowNameOrValue: string, fieldKey: string): boolean {
    return this.getRequirements(workflowNameOrValue).requiredFields.some(
      (field) => field.key === fieldKey
    );
  }

  private findCategory(
    requirement: DocumentRequirement,
    categories: DocumentCategory[]
  ): DocumentCategory | null {
    return (
      categories.find((category) => {
        const categoryName = category.category_name.toLowerCase();
        return requirement.categoryKeywords.some((keyword) => categoryName.includes(keyword));
      }) || null
    );
  }
}
