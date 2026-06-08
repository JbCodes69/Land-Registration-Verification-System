from django.contrib import admin
from .models import (
    Roles,
    Users,
    WorkflowTypes,
    ApplicationStatuses,
    Applications,
    ApplicationParties,
    DocumentCategories,
    Documents,
    Payments,
    LandDetails,
    VerificationLogs,
    DisputeFlags,
    ReviewLogs,
    AuditLogs,
    Notifications,
)

admin.site.register(Roles)
admin.site.register(Users)
admin.site.register(WorkflowTypes)
admin.site.register(ApplicationStatuses)
admin.site.register(Applications)
admin.site.register(ApplicationParties)
admin.site.register(DocumentCategories)
admin.site.register(Documents)
admin.site.register(Payments)
admin.site.register(LandDetails)
admin.site.register(VerificationLogs)
admin.site.register(DisputeFlags)
admin.site.register(ReviewLogs)
admin.site.register(AuditLogs)
admin.site.register(Notifications)