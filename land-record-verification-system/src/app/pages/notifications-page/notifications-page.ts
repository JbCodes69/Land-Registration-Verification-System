import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import {
  Application,
  LandDetail,
  Notification,
} from '../../models/api.models';

type NotificationCategory =
  | 'Application Update'
  | 'Dispute Alert'
  | 'Resolved Dispute'
  | 'Payment Reminder';

interface ApplicantNotification {
  id: number;
  title: string;
  message: string;
  category: NotificationCategory;
  reference: string;
  dateTime: string;
  isRead: boolean;
  actionLabel: string;
  actionRoute: string;
}

@Component({
  selector: 'app-notifications-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './notifications-page.html',
  styleUrl: './notifications-page.css',
})
export class NotificationsPage {
  userName: string = 'User';
  currentUserId: number = 0;
  isLoading: boolean = false;
  errorMessage: string = '';

  selectedCategory: string = 'All';

  categoryOptions: string[] = [
    'All',
    'Application Update',
    'Dispute Alert',
    'Resolved Dispute',
    'Payment Reminder',
  ];

  notifications: ApplicantNotification[] = [];

  constructor(private apiService: ApiService, private authService: AuthService) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.currentUserId = currentUser?.user_id || 0;
    this.userName = currentUser?.full_name || this.userName;
    this.loadNotifications();
  }

  loadNotifications(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      notifications: this.apiService.getNotifications(),
      applications: this.apiService.getApplications(),
      landDetails: this.apiService.getLandDetails(),
    }).subscribe({
      next: ({ notifications, applications, landDetails }) => {
        this.notifications = notifications
          .filter((notification) => notification.user === this.currentUserId)
          .map((notification) =>
            this.mapNotification(notification, applications, landDetails)
          );

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load notifications:', error);
        this.errorMessage = 'Unable to load notifications from the server.';
        this.isLoading = false;
      },
    });
  }

  mapNotification(
    notification: Notification,
    applications: Application[],
    landDetails: LandDetail[]
  ): ApplicantNotification {
    const application = applications.find(
      (item) => item.application_id === notification.application
    );
    const landDetail = landDetails.find(
      (item) => item.land_detail_id === notification.land_detail
    );
    const category = this.mapNotificationCategory(notification.notification_type);

    return {
      id: notification.notification_id,
      title: notification.notification_title,
      message: notification.message,
      category,
      reference:
        application?.application_code ||
        landDetail?.parcel_number ||
        `Notification #${notification.notification_id}`,
      dateTime: this.formatDateTime(notification.created_at),
      isRead: notification.is_read,
      actionLabel: this.getActionLabel(category),
      actionRoute: this.getActionRoute(category),
    };
  }

  mapNotificationCategory(type: string): NotificationCategory {
    const normalizedType = type.toLowerCase();

    if (normalizedType.includes('resolved')) {
      return 'Resolved Dispute';
    }

    if (normalizedType.includes('dispute')) {
      return 'Dispute Alert';
    }

    if (normalizedType.includes('payment')) {
      return 'Payment Reminder';
    }

    return 'Application Update';
  }

  getActionLabel(category: NotificationCategory): string {
    if (category === 'Payment Reminder') {
      return 'View Payment';
    }

    if (category === 'Dispute Alert' || category === 'Resolved Dispute') {
      return 'Verify Land';
    }

    return 'View Status';
  }

  getActionRoute(category: NotificationCategory): string {
    if (category === 'Payment Reminder') {
      return '/payment';
    }

    if (category === 'Dispute Alert' || category === 'Resolved Dispute') {
      return '/verification';
    }

    return '/application-status';
  }

  get filteredNotifications(): ApplicantNotification[] {
    if (this.selectedCategory === 'All') {
      return this.notifications;
    }

    return this.notifications.filter(
      (notification) => notification.category === this.selectedCategory
    );
  }

  get unreadCount(): number {
    return this.notifications.filter((notification) => !notification.isRead).length;
  }

  getCategoryBadgeClass(category: NotificationCategory): string {
    const categoryClasses: Record<NotificationCategory, string> = {
      'Application Update': 'bg-blue-100 text-blue-800',
      'Dispute Alert': 'bg-red-100 text-red-800',
      'Resolved Dispute': 'bg-green-100 text-green-800',
      'Payment Reminder': 'bg-amber-100 text-amber-800',
    };

    return categoryClasses[category];
  }

  markAsRead(notification: ApplicantNotification): void {
    // TODO: Persist read state through the backend notification endpoint.
    notification.isRead = true;
  }

  markAllAsRead(): void {
    // TODO: Replace with a backend bulk update when notification persistence is connected.
    this.notifications = this.notifications.map((notification) => ({
      ...notification,
      isRead: true,
    }));
  }

  formatDateTime(value: string): string {
    return new Date(value).toLocaleString();
  }
}
