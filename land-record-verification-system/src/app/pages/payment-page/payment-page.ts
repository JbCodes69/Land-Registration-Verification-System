import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ApplicationDraftService } from '../../services/application-draft.service';
import {
  Application,
  Payment,
  WorkflowType,
} from '../../models/api.models';

type PaymentStatus = 'Pending' | 'Successful' | 'Failed';

interface PaymentSummary {
  reference: string;
  amount: number;
  method: string;
  status: PaymentStatus;
  date: string;
}

interface PaymentRecord {
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
  userName: string = 'User';
  currentUserId: number = 0;
  isLoading: boolean = false;
  errorMessage: string = '';

  paymentSummary: PaymentSummary | null = null;
  paymentHistory: PaymentRecord[] = [];
  userApplications: Application[] = [];
  selectedApplicationId: number | null = null;
  paymentAmount: number | null = null;
  paymentMethod: string = 'Mobile Money';
  paymentStatus: PaymentStatus = 'Pending';
  isSubmittingPayment: boolean = false;
  paymentMessage: string = '';
  paymentMessageType: 'success' | 'error' | '' = '';
  serviceType: string = 'Not provided';

  paymentMethods: string[] = [
    'Mobile Money',
    'Bank Transfer',
    'Card Payment',
    'Manual Office Payment',
  ];

  paymentStatuses: PaymentStatus[] = ['Pending', 'Successful', 'Failed'];

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private applicationDraftService: ApplicationDraftService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.currentUserId = currentUser?.user_id || 0;
    this.userName = currentUser?.full_name || this.userName;
    this.serviceType =
      this.applicationDraftService.getDraft().selectedWorkflowLabel || this.serviceType;
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
        this.userApplications = applications.filter(
          (application) => application.user === this.currentUserId
        );
        const userApplicationIds = this.userApplications.map(
          (application) => application.application_id
        );
        const userPayments = payments.filter((payment) =>
          userApplicationIds.includes(payment.application)
        );

        this.paymentHistory = userPayments
          .slice()
          .sort(
            (a, b) =>
              new Date(b.payment_date).getTime() -
              new Date(a.payment_date).getTime()
          )
          .map((payment) => this.mapPaymentRecord(payment));

        const currentPayment = userPayments[0];
        if (currentPayment) {
          this.paymentSummary = this.mapPaymentSummary(currentPayment);
          this.applicationDraftService.updateDraft({ currentPayment });
          this.serviceType = this.getPaymentServiceType(
            currentPayment,
            applications,
            workflowTypes
          );
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

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load payment data:', error);
        this.errorMessage = 'Unable to load payment data from the server.';
        this.isLoading = false;
      },
    });
  }

  mapPaymentRecord(payment: Payment): PaymentRecord {
    return {
      reference: payment.payment_reference,
      amount: Number(payment.amount),
      method: payment.payment_method,
      status: this.normalizePaymentStatus(payment.payment_status),
      date: this.formatDate(payment.payment_date),
    };
  }

  mapPaymentSummary(payment: Payment): PaymentSummary {
    return {
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
    const application = applications.find(
      (item) => item.application_id === payment.application
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

  normalizePaymentStatus(status: string): PaymentStatus {
    const normalizedStatus = status.toLowerCase();

    if (['successful', 'success', 'completed'].includes(normalizedStatus)) {
      return 'Successful';
    }

    if (['failed', 'declined'].includes(normalizedStatus)) {
      return 'Failed';
    }

    return 'Pending';
  }

  formatCurrency(amount: number): string {
    return `SLL ${amount.toLocaleString()}`;
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
    return status === 'Successful' ? 'Completed' : status;
  }

  createPayment(): void {
    this.paymentMessage = '';
    this.paymentMessageType = '';

    if (!this.selectedApplicationId) {
      this.paymentMessage = 'Select an application before creating a payment record.';
      this.paymentMessageType = 'error';
      return;
    }

    if (!this.paymentAmount || this.paymentAmount <= 0) {
      this.paymentMessage = 'Enter a valid payment amount.';
      this.paymentMessageType = 'error';
      return;
    }

    this.isSubmittingPayment = true;

    this.apiService.createPayment({
      application: this.selectedApplicationId,
      amount: this.paymentAmount,
      payment_method: this.paymentMethod,
      payment_status: this.paymentStatus,
    }).subscribe({
      next: (payment) => {
        this.paymentMessage = `Payment record saved. Reference: ${payment.payment_reference}`;
        this.paymentMessageType = 'success';
        this.isSubmittingPayment = false;
        this.applicationDraftService.updateDraft({
          currentApplicationId: payment.application,
          currentPayment: payment,
        });
        this.loadPayments();
      },
      error: (error) => {
        console.error('Failed to create payment:', error);
        this.paymentMessage = 'Unable to save payment record. Please try again.';
        this.paymentMessageType = 'error';
        this.isSubmittingPayment = false;
      },
    });
  }

  continueToSummary(): void {
    this.router.navigate(['/application-summary']);
  }

  printPage(): void {
    window.print();
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString();
  }
}
