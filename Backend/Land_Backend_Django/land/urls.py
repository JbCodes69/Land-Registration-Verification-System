from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RolesViewSet,
    UsersViewSet,
    WorkflowTypesViewSet,
    ApplicationStatusesViewSet,
    ApplicationsViewSet,
    LandDetailsViewSet,
    ApplicationPartiesViewSet,
    DocumentCategoriesViewSet,
    DocumentsViewSet,
    PaymentsViewSet,
    ReviewLogsViewSet,
    VerificationLogsViewSet,
    AuditLogsViewSet,
    DisputeFlagsViewSet,
    NotificationsViewSet,
    login_view,
    me_view,
    request_otp_view,
    signup_view,
    verify_otp_view,
)

router = DefaultRouter()

router.register(r'roles', RolesViewSet)
router.register(r'users', UsersViewSet)
router.register(r'workflow-types', WorkflowTypesViewSet)
router.register(r'application-statuses', ApplicationStatusesViewSet)
router.register(r'applications', ApplicationsViewSet)
router.register(r'land-details', LandDetailsViewSet)
router.register(r'application-parties', ApplicationPartiesViewSet)
router.register(r'document-categories', DocumentCategoriesViewSet)
router.register(r'documents', DocumentsViewSet)
router.register(r'payments', PaymentsViewSet)
router.register(r'review-logs', ReviewLogsViewSet)
router.register(r'verification-logs', VerificationLogsViewSet)
router.register(r'audit-logs', AuditLogsViewSet)
router.register(r'dispute-flags', DisputeFlagsViewSet)
router.register(r'notifications', NotificationsViewSet)

urlpatterns = [
    path('auth/request-otp/', request_otp_view, name='auth-request-otp'),
    path('auth/verify-otp/', verify_otp_view, name='auth-verify-otp'),
    path('auth/signup/', signup_view, name='auth-signup'),
    path('auth/login/', login_view, name='auth-login'),
    path('auth/me/<int:user_id>/', me_view, name='auth-me'),
    path('', include(router.urls)),
]
