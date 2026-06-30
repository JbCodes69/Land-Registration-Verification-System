import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import {
  VerificationReport,
  VerificationSearchRecord,
  VerificationPaymentRequired,
} from '../../models/api.models';

type VerificationStatus =
  | 'Verified'
  | 'Already Registered'
  | 'Disputed'
  | 'Resolved'
  | 'Not Available';

interface LandVerificationRecord {
  landDetailId: number;
  parcelNumber: string;
  plotNumber: string;
  location: string;
  registeredOwner: string;
  workflowSource: string;
  lastUpdated: string;
  status: VerificationStatus;
  landUse: string;
  registrationDate: string;
  disputeHistory: string[];
  disputeStatus: string;
  paymentReference: string;
  verificationNote: string;
}

@Component({
  selector: 'app-verification-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './verification-page.html',
  styleUrl: './verification-page.css',
})
export class VerificationPage {
  isSidebarOpen: boolean = false;
  userName: string = 'User';
  currentUserId: number = 0;
  isLoading: boolean = false;
  errorMessage: string = '';

  searchTerm: string = '';
  selectedStatus: string = 'All';
  selectedWorkflow: string = 'All';
  selectedRecord: LandVerificationRecord | null = null;
  selectedReport: VerificationReport | null = null;
  isLoadingDetails: boolean = false;
  detailsMessage: string = '';
  hasSearched: boolean = false;

  statusOptions: string[] = [
    'All',
    'Verified',
    'Already Registered',
    'Disputed',
    'Resolved',
  ];

  workflowOptions: string[] = ['All'];
  landRecords: LandVerificationRecord[] = [];

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.currentUserId = currentUser?.user_id || 0;
    this.userName = currentUser?.full_name || this.userName;
    const requestedLandDetailId = Number(
      this.route.snapshot.queryParamMap.get('landDetailId') || 0
    );
    const shouldOpenDetails =
      this.route.snapshot.queryParamMap.get('viewDetails') === '1';
    const requestedVerificationLogId = Number(
      this.route.snapshot.queryParamMap.get('verificationLogId') || 0
    );
    if (shouldOpenDetails && requestedLandDetailId > 0) {
      this.openPaidReportByLandDetailId(
        requestedLandDetailId,
        requestedVerificationLogId > 0 ? requestedVerificationLogId : null
      );
    }
  }

  loadLandRecords(openLandDetailId: number | null = null): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.apiService.getVerificationSearchRecords(this.searchTerm).subscribe({
      next: (records) => {
        this.landRecords = records.map((record) =>
          this.mapVerificationSearchRecord(record)
        );
        this.workflowOptions = [
          'All',
          ...Array.from(
            new Set(this.landRecords.map((record) => record.workflowSource))
          ).filter(Boolean),
        ];
        this.isLoading = false;

        if (openLandDetailId) {
          const recordToOpen = this.landRecords.find(
            (record) => record.landDetailId === openLandDetailId
          );
          if (recordToOpen) {
            this.openRecordDetails(recordToOpen);
          }
        }
      },
      error: () => {
        console.error('Failed to load land verification records.');
        this.errorMessage = 'Unable to load land verification records from the server.';
        this.isLoading = false;
      },
    });
  }

  mapVerificationSearchRecord(record: VerificationSearchRecord): LandVerificationRecord {
    return {
      landDetailId: record.land_detail_id,
      parcelNumber: record.parcel_number || 'Not provided',
      plotNumber: record.plot_number || 'Not provided',
      location: record.property_location || 'Not provided',
      registeredOwner: record.registered_owner || 'Owner details unavailable',
      workflowSource: record.service_type || 'Service not specified',
      lastUpdated: this.formatDate(record.last_updated),
      status: this.normalizeVerificationStatus(record.status),
      landUse: 'Payment required for full details',
      registrationDate: 'Payment required',
      disputeHistory: ['Payment required for full dispute history.'],
      disputeStatus: record.status === 'Disputed' ? 'Disputed' : 'Limited result',
      paymentReference: 'Payment required',
      verificationNote: 'Pay the Land Verification fee to view the full report.',
    };
  }

  normalizeVerificationStatus(status: string): VerificationStatus {
    const normalizedStatus = (status || '').trim().toLowerCase();
    const statusMap: Record<string, VerificationStatus> = {
      verified: 'Verified',
      approved: 'Verified',
      registered: 'Verified',
      completed: 'Verified',
      'already registered': 'Already Registered',
      disputed: 'Disputed',
      resolved: 'Resolved',
    };

    return statusMap[normalizedStatus] || 'Not Available';
  }

  get filteredLandRecords(): LandVerificationRecord[] {
    if (!this.hasSearched) {
      return [];
    }

    const normalizedSearch = this.searchTerm.trim().toLowerCase();

    return this.landRecords.filter((record) => {
      const matchesSearch =
        !normalizedSearch ||
        record.parcelNumber.toLowerCase().includes(normalizedSearch) ||
        record.plotNumber.toLowerCase().includes(normalizedSearch) ||
        record.location.toLowerCase().includes(normalizedSearch) ||
        record.registeredOwner.toLowerCase().includes(normalizedSearch);

      const matchesStatus =
        this.selectedStatus === 'All' || record.status === this.selectedStatus;

      const matchesWorkflow =
        this.selectedWorkflow === 'All' ||
        record.workflowSource === this.selectedWorkflow;

      return matchesSearch && matchesStatus && matchesWorkflow;
    });
  }

  getStatusBadgeClass(status: VerificationStatus): string {
    const statusClasses: Record<VerificationStatus, string> = {
      Verified: 'bg-green-100 text-green-800',
      'Already Registered': 'bg-blue-100 text-blue-800',
      Disputed: 'bg-red-100 text-red-800',
      Resolved: 'bg-green-100 text-green-800',
      'Not Available': 'bg-gray-100 text-gray-700',
    };

    return statusClasses[status];
  }

  maskParcelNumber(parcelNumber: string): string {
    const visibleStart = parcelNumber.slice(0, 4);
    const visibleEnd = parcelNumber.slice(-3);

    return `${visibleStart}-****-${visibleEnd}`;
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedStatus = 'All';
    this.selectedWorkflow = 'All';
    this.landRecords = [];
    this.hasSearched = false;
  }

  searchRecords(): void {
    this.detailsMessage = '';
    this.errorMessage = '';
    const normalizedSearch = this.searchTerm.trim();

    if (!normalizedSearch) {
      this.landRecords = [];
      this.hasSearched = false;
      this.errorMessage =
        'Enter a parcel number, plot number, location, or owner name before searching.';
      return;
    }

    this.hasSearched = true;
    this.loadLandRecords();
  }

  openRecordDetails(record: LandVerificationRecord): void {
    this.detailsMessage = '';
    this.isLoadingDetails = true;

    this.apiService
      .getVerificationReport(record.landDetailId, this.searchTerm || record.parcelNumber)
      .subscribe({
        next: (report) => {
          if (this.isPaymentRequiredReport(report)) {
            this.isLoadingDetails = false;
            this.router.navigate(['/payment'], {
              queryParams: {
                verificationLogId: report.verification_log_id,
                landDetailId: report.land_detail_id || record.landDetailId,
                serviceType: report.service_type,
              },
            });
            return;
          }

          this.selectedRecord = this.mapReportToRecord(report);
          this.selectedReport = report;
          this.isLoadingDetails = false;
        },
        error: (error) => {
          this.isLoadingDetails = false;
          const backendError = error?.error || {};
          console.error('Failed to load paid verification report.');
          this.detailsMessage =
            backendError?.detail ||
            'Unable to load the verification report. Please try again.';
        },
      });
  }

  openPaidReportByLandDetailId(
    landDetailId: number,
    verificationLogId: number | null = null
  ): void {
    this.detailsMessage = '';
    this.isLoadingDetails = true;

    this.apiService
      .getVerificationReport(landDetailId, this.searchTerm, verificationLogId)
      .subscribe({
        next: (report) => {
          if (this.isPaymentRequiredReport(report)) {
            this.isLoadingDetails = false;
            this.router.navigate(['/payment'], {
              queryParams: {
                verificationLogId: report.verification_log_id,
                landDetailId: report.land_detail_id,
                serviceType: report.service_type,
              },
            });
            return;
          }

          this.selectedRecord = this.mapReportToRecord(report);
          this.selectedReport = report;
          this.isLoadingDetails = false;
        },
        error: (error) => {
          this.isLoadingDetails = false;
          const backendError = error?.error || {};
          this.detailsMessage =
            backendError?.detail ||
            'Unable to load the verification report. Please try again.';
        },
      });
  }

  isPaymentRequiredReport(
    report: VerificationReport | VerificationPaymentRequired
  ): report is VerificationPaymentRequired {
    return 'payment_required' in report && report.payment_required;
  }

  closeRecordDetails(): void {
    this.selectedRecord = null;
    this.selectedReport = null;
    this.detailsMessage = '';
  }

  mapReportToRecord(report: VerificationReport): LandVerificationRecord {
    return {
      landDetailId: report.land_detail_id,
      parcelNumber: report.parcel_number || 'Not provided',
      plotNumber: report.plot_number || 'Not provided',
      location: report.property_location || 'Not provided',
      registeredOwner: report.registered_owner || 'Owner details unavailable',
      workflowSource: report.service_type || 'Service not specified',
      lastUpdated: this.formatDate(report.last_updated),
      status: this.normalizeVerificationStatus(report.status),
      landUse: report.land_description || 'Not specified',
      registrationDate: this.formatDate(report.registration_date || report.created_at),
      disputeHistory: report.dispute_history?.length
        ? report.dispute_history
        : ['No dispute history recorded.'],
      disputeStatus: report.dispute_status || 'No active dispute',
      paymentReference: report.payment_reference || 'Not provided',
      verificationNote: report.verification_note || 'Full verification report available.',
    };
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
