import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../services/api.service';
import {
  Application,
  Payment,
  User,
  WorkflowType,
} from '../../models/api.models';

type AdminPaymentStatus = 'Pending' | 'Successful' | 'Failed';

interface AdminPaymentRecord {
  reference: string;
  applicationReference: string;
  applicant: string;
  workflowType: string;
  amount: number;
  method: string;
  status: AdminPaymentStatus;
  date: string;
}

@Component({
  selector: 'app-admin-payments',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-payments.html',
  styleUrl: './admin-payments.css',
})
export class AdminPayments {
  isSidebarOpen: boolean = false;
  adminName: string = 'Administrator';
  isLoading: boolean = false;
  errorMessage: string = '';

  searchTerm: string = '';
  selectedStatus: string = 'All';
  selectedMethod: string = 'All';

  statusOptions: string[] = ['All', 'Pending', 'Successful', 'Failed'];

  methodOptions: string[] = ['All', 'Mobile Money', 'Card'];

  paymentRecords: AdminPaymentRecord[] = [];

  constructor(private apiService: ApiService) {}

  ngOnInit(): void {
    this.loadPaymentRecords();
  }

  loadPaymentRecords(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      payments: this.apiService.getPayments(),
      applications: this.apiService.getApplications(),
      users: this.apiService.getUsers(),
      workflowTypes: this.apiService.getWorkflowTypes(),
    }).subscribe({
      next: ({ payments, applications, users, workflowTypes }) => {
        this.paymentRecords = payments
          .slice()
          .sort(
            (a, b) =>
              new Date(b.payment_date).getTime() -
              new Date(a.payment_date).getTime()
          )
          .map((payment) =>
            this.mapPaymentRecord(payment, applications, users, workflowTypes)
          );

        this.methodOptions = [
          'All',
          ...Array.from(new Set(this.paymentRecords.map((payment) => payment.method))),
        ];
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load admin payment records.');
        this.errorMessage = 'Unable to load payment records from the server.';
        this.isLoading = false;
      },
    });
  }

  mapPaymentRecord(
    payment: Payment,
    applications: Application[],
    users: User[],
    workflowTypes: WorkflowType[]
  ): AdminPaymentRecord {
    const application = applications.find(
      (item) => item.application_id === payment.application
    );
    const applicant = application
      ? users.find((user) => user.user_id === application.user)?.full_name ||
        `User #${application.user}`
      : 'Not available';
    const workflowType = application
      ? this.getServiceTypeName(application, workflowTypes)
      : this.normalizeServiceType(payment.service_type || '');

    return {
      reference: payment.payment_reference,
      applicationReference: application?.application_code || 'No application record available',
      applicant,
      workflowType,
      amount: Number(payment.amount),
      method: payment.payment_method,
      status: this.normalizePaymentStatus(payment.payment_status),
      date: this.formatDate(payment.payment_date),
    };
  }

  normalizePaymentStatus(status: string): AdminPaymentStatus {
    const normalizedStatus = status.toLowerCase();

    if (['completed', 'successful', 'success'].includes(normalizedStatus)) {
      return 'Successful';
    }

    if (['failed', 'declined'].includes(normalizedStatus)) {
      return 'Failed';
    }

    return 'Pending';
  }

  get filteredPayments(): AdminPaymentRecord[] {
    const normalizedSearch = this.searchTerm.trim().toLowerCase();

    return this.paymentRecords.filter((payment) => {
      const matchesSearch =
        !normalizedSearch ||
        payment.reference.toLowerCase().includes(normalizedSearch) ||
        payment.applicationReference.toLowerCase().includes(normalizedSearch) ||
        payment.applicant.toLowerCase().includes(normalizedSearch);

      const matchesStatus =
        this.selectedStatus === 'All' || payment.status === this.selectedStatus;

      const matchesMethod =
        this.selectedMethod === 'All' || payment.method === this.selectedMethod;

      return matchesSearch && matchesStatus && matchesMethod;
    });
  }

  get completedTotal(): number {
    return this.paymentRecords
      .filter((payment) => payment.status === 'Successful')
      .reduce((total, payment) => total + payment.amount, 0);
  }

  get pendingCount(): number {
    return this.paymentRecords.filter((payment) => payment.status === 'Pending').length;
  }

  get failedCount(): number {
    return this.paymentRecords.filter((payment) => payment.status === 'Failed').length;
  }

  formatCurrency(amount: number): string {
    return `GHS ${amount.toFixed(2)}`;
  }

  getServiceTypeName(application: Application, workflowTypes: WorkflowType[]): string {
    const workflowTypeId = Number(application.workflow_type);
    const workflowName =
      workflowTypes.find(
        (workflow) => Number(workflow.workflow_type_id) === workflowTypeId
      )?.workflow_name || '';

    return this.normalizeServiceType(workflowName);
  }

  normalizeServiceType(serviceName: string): string {
    const normalizedServiceName = (serviceName || '').trim().toLowerCase();
    const serviceNames: Record<string, string> = {
      registration: 'Land Registration',
      'land registration': 'Land Registration',
      transfer: 'Transfer of Title',
      'transfer of title': 'Transfer of Title',
      concurrence: 'Concurrence',
      consent: 'Consent',
      verification: 'Land Verification',
      'land verification': 'Land Verification',
    };

    return serviceNames[normalizedServiceName] || serviceName.trim() || 'Service type not available';
  }

  getPaymentBadgeClass(status: AdminPaymentStatus): string {
    const statusClasses: Record<AdminPaymentStatus, string> = {
      Pending: 'bg-amber-100 text-amber-800',
      Successful: 'bg-green-100 text-green-800',
      Failed: 'bg-red-100 text-red-800',
    };

    return statusClasses[status];
  }

  getPaymentStatusLabel(status: string): string {
    return status;
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedStatus = 'All';
    this.selectedMethod = 'All';
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
