import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ApplicationDraftService } from '../../services/application-draft.service';
import { AppNotificationService } from '../../services/app-notification.service';
import {
  Application,
  Payment,
  WorkflowType,
} from '../../models/api.models';

type PaymentStatus = 'Pending' | 'Successful' | 'Failed';
type PaymentMethod = 'Mobile Money' | 'Card';
type MobileMoneyProvider = 'MTN Mobile Money' | 'Telecel Cash' | 'AirtelTigo Money';

interface PaymentSummary {
  applicationId: number;
  reference: string;
  amount: number;
  method: string;
  status: PaymentStatus;
  date: string;
}

interface PaymentRecord {
  applicationId: number;
  reference: string;
  amount: number;
  method: string;
  status: PaymentStatus;
  date: string;
}

@Component({
  selector: 'app-payment-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './payment-page.html',
  styleUrl: './payment-page.css',
})
export class PaymentPage {
  isSidebarOpen: boolean = false;
  private readonly fixedServiceFees: Record<string, number> = {
    'Land Verification': 5,
    Consent: 10,
    Concurrence: 15,
    'Land Registration': 20,
    'Transfer of Title': 25,
  };

  userName: string = 'User';
  currentUserId: number = 0;
  isLoading: boolean = false;
  errorMessage: string = '';

  paymentSummary: PaymentSummary | null = null;
  paymentHistory: PaymentRecord[] = [];
  userApplications: Application[] = [];
  workflowTypes: WorkflowType[] = [];
  userPayments: Payment[] = [];
  selectedApplicationId: number | null = null;
  paymentAmount: number | null = null;
  paymentMethod: PaymentMethod = 'Mobile Money';
  mobileMoneyProvider: MobileMoneyProvider = 'MTN Mobile Money';
  mobileMoneyNumber: string = '';
  cardholderName: string = '';
  cardNumber: string = '';
  expiryDate: string = '';
  cvv: string = '';
  isSubmittingPayment: boolean = false;
  paymentMessage: string = '';
  paymentMessageType: 'success' | 'error' | '' = '';
  serviceType: string = 'Not provided';
  isVerificationPayment: boolean = false;
  verificationLogId: number | null = null;
  verificationLandDetailId: number | null = null;

  paymentMethods: PaymentMethod[] = ['Mobile Money', 'Card'];
  mobileMoneyProviders: MobileMoneyProvider[] = [
    'MTN Mobile Money',
    'Telecel Cash',
    'AirtelTigo Money',
  ];

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private applicationDraftService: ApplicationDraftService,
    private route: ActivatedRoute,
    private appNotificationService: AppNotificationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.currentUserId = currentUser?.user_id || 0;
    this.userName = currentUser?.full_name || this.userName;

    const queryParams = this.route.snapshot.queryParamMap;
    this.verificationLogId = this.readPositiveNumber(
      queryParams.get('verificationLogId')
    );
    this.verificationLandDetailId = this.readPositiveNumber(
      queryParams.get('landDetailId')
    );
    this.isVerificationPayment = !!this.verificationLogId;

    if (this.isVerificationPayment) {
      this.serviceType = 'Land Verification';
      this.paymentAmount = this.fixedServiceFees['Land Verification'];
      this.loadPayments();
      return;
    }

    this.serviceType = this.normalizeServiceType(
      this.applicationDraftService.getDraft().selectedWorkflowLabel
    ) || this.serviceType;
    this.loadPayments();
  }

  loadPayments(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      payments: this.apiService.getPayments(),
      applications: this.apiService.getApplications(),
      workflowTypes: this.apiService.getWorkflowTypes(),
    }).subscribe({
      next: ({ payments, applications, workflowTypes }) => {
        this.workflowTypes = workflowTypes;

        if (this.isVerificationPayment) {
          this.userApplications = [];
          this.userPayments = payments.filter(
            (payment) =>
              this.getPaymentVerificationLogId(payment) === this.verificationLogId
          );
        } else {
          this.userApplications = applications.filter(
            (application) => application.user === this.currentUserId
          );
          const userApplicationIds = this.userApplications.map(
            (application) => application.application_id
          );
          this.userPayments = payments.filter((payment) =>
            userApplicationIds.includes(this.getPaymentApplicationId(payment) || 0)
          );
        }

        this.paymentHistory = this.userPayments
          .slice()
          .sort(
            (a, b) =>
              new Date(b.payment_date).getTime() -
              new Date(a.payment_date).getTime()
          )
          .map((payment) => this.mapPaymentRecord(payment));

        if (this.isVerificationPayment) {
          this.updateVerificationPaymentState();
          this.isLoading = false;
          return;
        }

        const draftApplicationId = this.applicationDraftService.getDraft().currentApplicationId;
        if (
          draftApplicationId &&
          this.userApplications.some((application) => application.application_id === draftApplicationId)
        ) {
          this.selectedApplicationId = draftApplicationId;
        } else if (!this.selectedApplicationId && this.userApplications.length > 0) {
          this.selectedApplicationId = this.userApplications[0].application_id;
        }

        this.updateSelectedApplicationPaymentState();
        this.isLoading = false;
      },
      error: () => {
        console.error('Failed to load payment data.');
        this.errorMessage = 'Unable to load payment data from the server.';
        this.isLoading = false;
      },
    });
  }

  mapPaymentRecord(payment: Payment): PaymentRecord {
    return {
      applicationId: this.getPaymentApplicationId(payment) || 0,
      reference: payment.payment_reference,
      amount: Number(payment.amount),
      method: payment.payment_method,
      status: this.normalizePaymentStatus(payment.payment_status),
      date: this.formatDate(payment.payment_date),
    };
  }

  mapPaymentSummary(payment: Payment): PaymentSummary {
    return {
      applicationId: this.getPaymentApplicationId(payment) || 0,
      reference: payment.payment_reference,
      amount: Number(payment.amount),
      method: payment.payment_method,
      status: this.normalizePaymentStatus(payment.payment_status),
      date: this.formatDate(payment.payment_date),
    };
  }

  getPaymentServiceType(
    payment: Payment,
    applications: Application[],
    workflowTypes: WorkflowType[]
  ): string {
    if (payment.service_type) {
      return this.normalizeServiceType(payment.service_type) || payment.service_type;
    }

    const paymentApplicationId = this.getPaymentApplicationId(payment);
    const application = applications.find(
      (item) => item.application_id === paymentApplicationId
    );

    if (!application) {
      return this.serviceType;
    }

    return (
      workflowTypes.find(
        (workflow) => workflow.workflow_type_id === application.workflow_type
      )?.workflow_name || this.serviceType
    );
  }

  getPaymentApplicationId(payment: Payment): number | null {
    return payment.application || payment.application_id || null;
  }

  getPaymentVerificationLogId(payment: Payment): number | null {
    return payment.verification_log || payment.verification_log_id || null;
  }

  normalizeServiceType(serviceType: string): string {
    const normalizedServiceType = (serviceType || '').trim().toLowerCase();
    const aliases: Record<string, string> = {
      verification: 'Land Verification',
      'land verification': 'Land Verification',
      consent: 'Consent',
      concurrence: 'Concurrence',
      registration: 'Land Registration',
      'land registration': 'Land Registration',
      transfer: 'Transfer of Title',
      'transfer of title': 'Transfer of Title',
    };

    return aliases[normalizedServiceType] || serviceType;
  }

  normalizePaymentStatus(status: string | null | undefined): PaymentStatus {
    const normalizedStatus = (status || '').toLowerCase();

    if (['successful', 'success', 'completed'].includes(normalizedStatus)) {
      return 'Successful';
    }

    if (['failed', 'declined'].includes(normalizedStatus)) {
      return 'Failed';
    }

    return 'Pending';
  }

  formatCurrency(amount: number): string {
    return `GHS ${amount.toFixed(2)}`;
  }

  getPaymentBadgeClass(status: PaymentStatus): string {
    const statusClasses: Record<PaymentStatus, string> = {
      Pending: 'bg-amber-100 text-amber-800',
      Successful: 'bg-green-100 text-green-800',
      Failed: 'bg-red-100 text-red-800',
    };

    return statusClasses[status];
  }

  getPaymentStatusLabel(status: PaymentStatus): string {
    return status;
  }

  getSelectedApplication(): Application | null {
    return (
      this.userApplications.find(
        (application) => application.application_id === this.selectedApplicationId
      ) || null
    );
  }

  getServiceTypeForApplication(application: Application | null): string {
    if (!application) {
      return this.serviceType;
    }

    const workflowName =
      this.workflowTypes.find(
        (workflow) => workflow.workflow_type_id === application.workflow_type
      )?.workflow_name || this.serviceType;

    return this.normalizeServiceType(workflowName);
  }

  getFixedAmountForService(serviceType: string): number | null {
    return this.fixedServiceFees[this.normalizeServiceType(serviceType)] ?? null;
  }

  updateVerificationPaymentState(): void {
    this.serviceType = 'Land Verification';
    this.paymentAmount = this.fixedServiceFees['Land Verification'];

    const latestPayment = this.userPayments
      .slice()
      .sort(
        (a, b) =>
          new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
      )[0] || null;
    this.paymentSummary = latestPayment ? this.mapPaymentSummary(latestPayment) : null;

    this.applicationDraftService.updateDraft({
      currentPayment: this.getSuccessfulVerificationPayment() || latestPayment,
    });
  }

  updateSelectedApplicationPaymentState(): void {
    const selectedApplication = this.getSelectedApplication();
    this.serviceType = this.getServiceTypeForApplication(selectedApplication);
    this.paymentAmount = this.getFixedAmountForService(this.serviceType);

    const selectedPayments = this.getSelectedApplicationPayments();
    const latestPayment = selectedPayments[0] || null;
    this.paymentSummary = latestPayment ? this.mapPaymentSummary(latestPayment) : null;

    this.applicationDraftService.updateDraft({
      currentApplicationId: selectedApplication?.application_id || null,
      currentApplicationCode: selectedApplication?.application_code || '',
      currentPayment: this.getSuccessfulPaymentForSelectedApplication() || latestPayment,
    });
  }

  onSelectedApplicationChange(): void {
    this.paymentMessage = '';
    this.paymentMessageType = '';
    this.updateSelectedApplicationPaymentState();
  }

  onPaymentMethodChange(): void {
    this.paymentMessage = '';
    this.paymentMessageType = '';
  }

  getSelectedApplicationPayments(): Payment[] {
    if (!this.selectedApplicationId) {
      return [];
    }

    return this.userPayments
      .filter((payment) => this.getPaymentApplicationId(payment) === this.selectedApplicationId)
      .slice()
      .sort(
        (a, b) =>
          new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
      );
  }

  getSuccessfulPaymentForSelectedApplication(): Payment | null {
    return (
      this.getSelectedApplicationPayments().find(
        (payment) => this.normalizePaymentStatus(payment.payment_status) === 'Successful'
      ) || null
    );
  }

  getSuccessfulVerificationPayment(): Payment | null {
    return (
      this.userPayments.find(
        (payment) => this.normalizePaymentStatus(payment.payment_status) === 'Successful'
      ) || null
    );
  }

  canContinueToSummary(): boolean {
    if (this.isVerificationPayment) {
      return !!this.getSuccessfulVerificationPayment();
    }

    return !!this.getSuccessfulPaymentForSelectedApplication();
  }

  canCreatePayment(): boolean {
    if (
      (!this.isVerificationPayment && !this.selectedApplicationId) ||
      (this.isVerificationPayment && !this.verificationLogId) ||
      !this.paymentAmount
    ) {
      return false;
    }

    if (this.paymentMethod === 'Mobile Money') {
      return !!this.mobileMoneyProvider && !!this.mobileMoneyNumber.trim();
    }

    return (
      !!this.cardholderName.trim() &&
      !!this.cardNumber.trim() &&
      !!this.expiryDate.trim() &&
      !!this.cvv.trim()
    );
  }

  getBackendErrorMessage(error: any): string {
    const backendError = error?.error || error;

    if (typeof backendError === 'string') {
      return backendError;
    }

    if (backendError?.detail) {
      return String(backendError.detail);
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

    return 'Unable to confirm payment. Please try again.';
  }

  clearSensitivePaymentFields(): void {
    this.cardNumber = '';
    this.cvv = '';
  }

  createPayment(): void {
    this.paymentMessage = '';
    this.paymentMessageType = '';

    if (!this.isVerificationPayment && !this.selectedApplicationId) {
      this.paymentMessage = 'Select an application before confirming payment.';
      this.paymentMessageType = 'error';
      return;
    }

    if (this.isVerificationPayment && !this.verificationLogId) {
      this.paymentMessage = 'Open a land verification record before confirming payment.';
      this.paymentMessageType = 'error';
      return;
    }

    if (!this.paymentAmount || this.paymentAmount <= 0) {
      this.paymentMessage = 'This application does not have a supported fixed service fee.';
      this.paymentMessageType = 'error';
      return;
    }

    if (!this.canCreatePayment()) {
      this.paymentMessage = 'Complete the required payment details before confirming payment.';
      this.paymentMessageType = 'error';
      return;
    }

    this.isSubmittingPayment = true;
    const applicationId = this.selectedApplicationId;
    const amount = this.paymentAmount;
    const basePayload = this.isVerificationPayment
      ? {
          verification_log_id: this.verificationLogId || 0,
          service_type: 'Land Verification',
          amount,
        }
      : {
          application_id: applicationId || 0,
          amount,
        };
    const paymentPayload =
      this.paymentMethod === 'Mobile Money'
        ? {
            ...basePayload,
            payment_method: this.paymentMethod,
            provider: this.mobileMoneyProvider,
            mobile_money_number: this.mobileMoneyNumber,
          }
        : {
            ...basePayload,
            payment_method: this.paymentMethod,
            cardholder_name: this.cardholderName,
            card_number: this.cardNumber.replace(/\s/g, ''),
            expiry_date: this.expiryDate,
            cvv: this.cvv,
          };

    this.apiService.createPayment(paymentPayload).subscribe({
      next: (payment) => {
        this.paymentMessage = `Payment confirmed. Reference: ${payment.payment_reference}`;
        this.paymentMessageType = 'success';
        this.isSubmittingPayment = false;
        this.clearSensitivePaymentFields();
        this.applicationDraftService.updateDraft(
          this.isVerificationPayment
            ? { currentPayment: payment }
            : {
                currentApplicationId: this.getPaymentApplicationId(payment),
                currentPayment: payment,
              }
        );

        if (this.isVerificationPayment && this.verificationLandDetailId) {
          this.appNotificationService.success(
            `Verification payment confirmed. Reference: ${payment.payment_reference}`
          );
          this.router.navigate(['/verification'], {
            queryParams: {
              landDetailId: this.verificationLandDetailId,
              verificationLogId: this.verificationLogId,
              viewDetails: '1',
            },
          });
          return;
        }

        this.loadPayments();
      },
      error: (error) => {
        console.error('Failed to create payment.');
        this.paymentMessage = this.getBackendErrorMessage(error);
        this.paymentMessageType = 'error';
        this.isSubmittingPayment = false;
      },
    });
  }

  continueToSummary(): void {
    if (!this.canContinueToSummary()) {
      this.paymentMessage = this.isVerificationPayment
        ? 'A successful verification payment is required before viewing the report.'
        : 'A successful payment is required before continuing to summary.';
      this.paymentMessageType = 'error';
      return;
    }

    if (this.isVerificationPayment) {
      this.router.navigate(['/verification'], {
        queryParams: {
          landDetailId: this.verificationLandDetailId,
          verificationLogId: this.verificationLogId,
          viewDetails: '1',
        },
      });
      return;
    }

    this.router.navigate(['/application-summary']);
  }

  readPositiveNumber(value: string | null): number | null {
    const parsedValue = Number(value || 0);
    return parsedValue > 0 ? parsedValue : null;
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

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }}
