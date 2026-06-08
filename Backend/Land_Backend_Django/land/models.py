from django.db import models


class Roles(models.Model):
    role_id = models.AutoField(primary_key=True)
    role_name = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        managed = False
        db_table = "roles"

    def __str__(self) -> str:
        return self.role_name


class Users(models.Model):
    user_id = models.AutoField(primary_key=True)
    role = models.ForeignKey(
        Roles,
        on_delete=models.DO_NOTHING,
        related_name="users",
    )
    full_name = models.CharField(max_length=150)
    email = models.EmailField(max_length=150, unique=True)
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    password_hash = models.CharField(max_length=255)
    is_active = models.BooleanField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "users"

    def __str__(self) -> str:
        return self.full_name


class WorkflowTypes(models.Model):
    workflow_type_id = models.AutoField(primary_key=True)
    workflow_name = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=255, blank=True, null=True)
    is_active = models.BooleanField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "workflow_types"

    def __str__(self) -> str:
        return self.workflow_name


class ApplicationStatuses(models.Model):
    status_id = models.AutoField(primary_key=True)
    status_name = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        managed = False
        db_table = "application_statuses"

    def __str__(self) -> str:
        return self.status_name


class Applications(models.Model):
    application_id = models.AutoField(primary_key=True)
    user = models.ForeignKey(
        Users,
        on_delete=models.DO_NOTHING,
        related_name="applications",
    )
    workflow_type = models.ForeignKey(
        WorkflowTypes,
        on_delete=models.DO_NOTHING,
        related_name="applications",
    )
    status = models.ForeignKey(
        ApplicationStatuses,
        on_delete=models.DO_NOTHING,
        related_name="applications",
    )
    application_code = models.CharField(max_length=100, unique=True)
    submitted_at = models.DateTimeField(blank=True, null=True)
    reviewed_at = models.DateTimeField(blank=True, null=True)
    reviewed_by = models.ForeignKey(
        Users,
        on_delete=models.DO_NOTHING,
        db_column="reviewed_by",
        related_name="reviewed_applications",
        blank=True,
        null=True,
    )
    remarks = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "applications"

    def __str__(self) -> str:
        return self.application_code


class LandDetails(models.Model):
    land_detail_id = models.AutoField(primary_key=True)
    application = models.OneToOneField(
        Applications,
        on_delete=models.DO_NOTHING,
        related_name="land_detail",
    )
    property_location = models.CharField(max_length=255)
    land_size = models.CharField(max_length=100, blank=True, null=True)
    parcel_number = models.CharField(max_length=100, blank=True, null=True)
    plot_number = models.CharField(max_length=100, blank=True, null=True)
    site_plan_number = models.CharField(max_length=100, blank=True, null=True)
    instrument_type = models.CharField(max_length=100, blank=True, null=True)
    instrument_date = models.DateField(blank=True, null=True)
    land_description = models.TextField(blank=True, null=True)
    is_already_registered = models.BooleanField(blank=True, null=True)
    is_disputed = models.BooleanField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "land_details"

    def __str__(self) -> str:
        return f"Land Detail {self.land_detail_id}"


class ApplicationParties(models.Model):
    party_id = models.AutoField(primary_key=True)
    application = models.ForeignKey(
        Applications,
        on_delete=models.DO_NOTHING,
        related_name="parties",
    )
    party_name = models.CharField(max_length=150)
    party_role = models.CharField(max_length=100)
    contact_details = models.CharField(max_length=150, blank=True, null=True)
    address = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "application_parties"

    def __str__(self) -> str:
        return f"{self.party_name} ({self.party_role})"


class DocumentCategories(models.Model):
    document_category_id = models.AutoField(primary_key=True)
    category_name = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        managed = False
        db_table = "document_categories"

    def __str__(self) -> str:
        return self.category_name


class Documents(models.Model):
    document_id = models.AutoField(primary_key=True)
    application = models.ForeignKey(
        Applications,
        on_delete=models.DO_NOTHING,
        related_name="documents",
    )
    document_category = models.ForeignKey(
        DocumentCategories,
        on_delete=models.DO_NOTHING,
        related_name="documents",
    )
    uploaded_by = models.ForeignKey(
        Users,
        on_delete=models.DO_NOTHING,
        db_column="uploaded_by",
        related_name="uploaded_documents",
    )
    document_name = models.CharField(max_length=150)
    file_path = models.CharField(max_length=255)
    upload_date = models.DateTimeField(blank=True, null=True)
    verification_status = models.CharField(max_length=50, blank=True, null=True)
    admin_remark = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "documents"

    def __str__(self) -> str:
        return self.document_name


class Payments(models.Model):
    payment_id = models.AutoField(primary_key=True)
    application = models.ForeignKey(
        Applications,
        on_delete=models.DO_NOTHING,
        related_name="payments",
        blank=True,
        null=True,
    )
    verification_log = models.ForeignKey(
        "VerificationLogs",
        on_delete=models.DO_NOTHING,
        related_name="payments",
        blank=True,
        null=True,
    )
    service_type = models.CharField(max_length=100, blank=True, null=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_status = models.CharField(max_length=50, blank=True, null=True)
    payment_reference = models.CharField(max_length=100, unique=True)
    payment_date = models.DateTimeField(blank=True, null=True)
    payment_method = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        managed = False
        db_table = "payments"

    def __str__(self) -> str:
        return self.payment_reference


class ReviewLogs(models.Model):
    review_log_id = models.AutoField(primary_key=True)
    application = models.ForeignKey(
        Applications,
        on_delete=models.DO_NOTHING,
        related_name="review_logs",
    )
    reviewed_by = models.ForeignKey(
        Users,
        on_delete=models.DO_NOTHING,
        db_column="reviewed_by",
        related_name="review_logs",
    )
    old_status = models.ForeignKey(
        ApplicationStatuses,
        on_delete=models.DO_NOTHING,
        related_name="old_status_review_logs",
        blank=True,
        null=True,
    )
    new_status = models.ForeignKey(
        ApplicationStatuses,
        on_delete=models.DO_NOTHING,
        related_name="new_status_review_logs",
    )
    comment = models.TextField(blank=True, null=True)
    review_date = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "review_logs"

    def __str__(self) -> str:
        return f"Review Log {self.review_log_id}"


class VerificationLogs(models.Model):
    verification_log_id = models.AutoField(primary_key=True)
    user = models.ForeignKey(
        Users,
        on_delete=models.DO_NOTHING,
        related_name="verification_logs",
    )
    land_detail = models.ForeignKey(
        LandDetails,
        on_delete=models.DO_NOTHING,
        related_name="verification_logs",
    )
    search_term = models.CharField(max_length=255)
    result_summary = models.TextField(blank=True, null=True)
    checked_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "verification_logs"

    def __str__(self) -> str:
        return f"Verification Log {self.verification_log_id}"


class AuditLogs(models.Model):
    audit_log_id = models.AutoField(primary_key=True)
    application = models.ForeignKey(
        Applications,
        on_delete=models.DO_NOTHING,
        related_name="audit_logs",
        blank=True,
        null=True,
    )
    user = models.ForeignKey(
        Users,
        on_delete=models.DO_NOTHING,
        related_name="audit_logs",
        blank=True,
        null=True,
    )
    action_type = models.CharField(max_length=100)
    action_description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "audit_logs"

    def __str__(self) -> str:
        return f"{self.action_type} - {self.audit_log_id}"


class DisputeFlags(models.Model):
    dispute_flag_id = models.AutoField(primary_key=True)
    land_detail = models.ForeignKey(
        LandDetails,
        on_delete=models.DO_NOTHING,
        related_name="dispute_flags",
    )
    flag_reason = models.TextField()
    flag_status = models.CharField(max_length=50, blank=True, null=True)
    flagged_by = models.ForeignKey(
        Users,
        on_delete=models.DO_NOTHING,
        db_column="flagged_by",
        related_name="flagged_disputes",
    )
    flagged_at = models.DateTimeField(blank=True, null=True)
    resolved_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "dispute_flags"

    def __str__(self) -> str:
        return f"Dispute Flag {self.dispute_flag_id}"


class Notifications(models.Model):
    notification_id = models.AutoField(primary_key=True)
    user = models.ForeignKey(
        Users,
        on_delete=models.DO_NOTHING,
        related_name="notifications",
    )
    application = models.ForeignKey(
        Applications,
        on_delete=models.DO_NOTHING,
        related_name="notifications",
        blank=True,
        null=True,
    )
    land_detail = models.ForeignKey(
        LandDetails,
        on_delete=models.DO_NOTHING,
        related_name="notifications",
        blank=True,
        null=True,
    )
    notification_type = models.CharField(max_length=50)
    notification_title = models.CharField(max_length=150)
    message = models.TextField()
    is_read = models.BooleanField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "notifications"

    def __str__(self) -> str:
        return self.notification_title


class OtpVerifications(models.Model):
    otp_id = models.AutoField(primary_key=True)
    email = models.CharField(max_length=150)
    otp_code = models.CharField(max_length=10)
    purpose = models.CharField(max_length=14, blank=True, null=True)
    is_used = models.BooleanField(blank=True, null=True)
    attempt_count = models.IntegerField(blank=True, null=True)
    expires_at = models.DateTimeField()
    verified_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "otp_verifications"

    def __str__(self) -> str:
        return f"{self.email} - {self.purpose}"
