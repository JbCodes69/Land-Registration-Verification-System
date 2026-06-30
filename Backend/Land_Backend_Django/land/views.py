import logging
import random
import smtplib
import sys
from datetime import timedelta

from django.core.mail import send_mail
from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from .models import (
    Roles,
    Users,
    WorkflowTypes,
    ApplicationStatuses,
    Applications,
    LandDetails,
    ApplicationParties,
    DocumentCategories,
    Documents,
    Payments,
    ReviewLogs,
    VerificationLogs,
    AuditLogs,
    DisputeFlags,
    Notifications,
    OtpVerifications,
)
from .auth_helpers import (
    decode_custom_jwt_token,
    generate_jwt_pair,
    is_administrator,
    is_applicant,
)
from .serializers import (
    AuthLoginSerializer,
    AuthRequestOtpSerializer,
    AuthSignupSerializer,
    AuthVerifyOtpSerializer,
    RolesSerializer,
    UsersSerializer,
    WorkflowTypesSerializer,
    ApplicationStatusesSerializer,
    ApplicationsSerializer,
    LandDetailsSerializer,
    ApplicationPartiesSerializer,
    DocumentCategoriesSerializer,
    DocumentsSerializer,
    PaymentsSerializer,
    ReviewLogsSerializer,
    VerificationLogsSerializer,
    AuditLogsSerializer,
    DisputeFlagsSerializer,
    NotificationsSerializer,
    serialize_auth_user,
)


logger = logging.getLogger(__name__)
PERMISSION_DENIED_MESSAGE = "You do not have permission to access this record."
PUBLIC_LAND_APPLICATION_STATUSES = [
    "approved",
    "registered",
    "verified",
    "completed",
]
APPLICATION_DRAFT_STATUSES = [
    "draft",
    "pending submission",
    "in progress",
]
APPLICATION_SUBMITTED_STATUSES = [
    "pending review",
    "submitted",
]


def get_current_user(request):
    auth_header = (
        request.headers.get("Authorization")
        or request.META.get("HTTP_AUTHORIZATION")
        or ""
    ).strip()
    if not auth_header:
        logger.info("Authorization header missing")
        return None

    auth_parts = auth_header.split()
    if len(auth_parts) != 2 or auth_parts[0].lower() != "bearer":
        logger.info("Bearer token missing")
        return None

    token = auth_parts[1].strip()
    if not token:
        logger.info("Bearer token missing")
        return None

    try:
        payload = decode_custom_jwt_token(token)
    except Exception as exc:
        error_name = type(exc).__name__.lower()
        if "expired" in error_name:
            logger.info("JWT decode failed: expired")
        else:
            logger.info("JWT decode failed: invalid")
        return None

    user_id = payload.get("user_id") or payload.get("id") or payload.get("user")
    if not user_id:
        logger.info("JWT decode failed: missing user_id")
        return None

    user = Users.objects.select_related("role").filter(user_id=user_id).first()
    if user is None:
        logger.info("User not found for token")
        return None

    if user.is_active is False:
        logger.info("User account inactive for token")
        return None
    return user


def require_current_user(request):
    user = get_current_user(request)
    if user is None:
        raise serializers.ValidationError("Authentication credentials were not provided.")
    return user


def is_current_user_admin(request):
    user = get_current_user(request)
    return bool(user and is_administrator(user))


def permission_denied_response(message=PERMISSION_DENIED_MESSAGE):
    return Response({"detail": message}, status=status.HTTP_403_FORBIDDEN)


def application_belongs_to_user(application, user):
    return bool(application and user and application.user_id == user.user_id)


def user_can_access_application(user, application):
    return bool(user and (is_administrator(user) or application_belongs_to_user(application, user)))


def public_land_details_queryset(queryset):
    return queryset.filter(public_land_details_filter()).distinct()


def find_application_status(status_names):
    for status_name in status_names:
        status_obj = ApplicationStatuses.objects.filter(
            status_name__iexact=status_name
        ).first()
        if status_obj:
            return status_obj
    return None


def public_land_details_filter():
    public_status_filter = models.Q()
    for status_name in PUBLIC_LAND_APPLICATION_STATUSES:
        public_status_filter |= models.Q(
            application__status__status_name__iexact=status_name
        )

    hidden_status_filter = models.Q()
    for status_name in [
        "draft",
        "pending submission",
        "submitted",
        "under review",
        "pending review",
        "incomplete",
        "rejected",
    ]:
        hidden_status_filter |= models.Q(
            application__status__status_name__iexact=status_name
        )

    active_dispute_filter = (
        models.Q(is_disputed=True)
        | models.Q(dispute_flags__flag_status__iexact="Disputed")
    ) & ~hidden_status_filter

    return public_status_filter | active_dispute_filter


def land_verification_payment_filter(user, land_detail, verification_log=None):
    payment_filter = models.Q(
        verification_log__user=user,
        verification_log__land_detail=land_detail,
        service_type="Land Verification",
        amount=PaymentsSerializer.FIXED_SERVICE_FEES["Land Verification"],
        payment_status__iexact="Successful",
    )
    if verification_log is not None:
        payment_filter &= models.Q(verification_log=verification_log)
    return payment_filter


def successful_land_verification_payment(user, land_detail, verification_log=None):
    return Payments.objects.filter(
        land_verification_payment_filter(user, land_detail, verification_log)
    ).order_by("-payment_date", "-payment_id").first()


def user_has_successful_land_verification_payment(user, land_detail):
    return successful_land_verification_payment(user, land_detail) is not None


def public_verification_status(land_detail):
    if land_detail.is_disputed or land_detail.dispute_flags.filter(
        flag_status__iexact="Disputed"
    ).exists():
        return "Disputed"

    if land_detail.dispute_flags.filter(flag_status__iexact="Resolved").exists():
        return "Resolved"

    if land_detail.is_already_registered:
        return "Already Registered"

    status_name = land_detail.application.status.status_name if land_detail.application_id else ""
    normalized_status = (status_name or "").strip().lower()
    if normalized_status in {"approved", "registered", "verified", "completed"}:
        return "Verified"

    return "Not Available"


def verification_search_record(land_detail):
    application = land_detail.application
    return {
        "land_detail_id": land_detail.land_detail_id,
        "parcel_number": land_detail.parcel_number,
        "plot_number": land_detail.plot_number,
        "property_location": land_detail.property_location,
        "registered_owner": application.user.full_name,
        "service_type": application.workflow_type.workflow_name,
        "status": public_verification_status(land_detail),
        "last_updated": land_detail.updated_at,
    }


def verification_report_record(land_detail, user, payment=None, verification_log=None):
    application = land_detail.application
    if payment is None:
        payment = successful_land_verification_payment(user, land_detail)
    related_disputes = list(land_detail.dispute_flags.all())
    latest_log = verification_log or land_detail.verification_logs.filter(
        user=user
    ).order_by("-checked_at", "-verification_log_id").first()

    return {
        **verification_search_record(land_detail),
        "payment_required": False,
        "application_id": application.application_id,
        "application_code": application.application_code,
        "application_status": application.status.status_name,
        "land_size": land_detail.land_size,
        "site_plan_number": land_detail.site_plan_number,
        "instrument_type": land_detail.instrument_type,
        "instrument_date": land_detail.instrument_date,
        "land_description": land_detail.land_description,
        "is_already_registered": land_detail.is_already_registered,
        "is_disputed": land_detail.is_disputed,
        "registration_date": land_detail.created_at,
        "created_at": land_detail.created_at,
        "payment_reference": payment.payment_reference if payment else None,
        "payment_date": payment.payment_date if payment else None,
        "dispute_status": (
            related_disputes[0].flag_status
            if related_disputes
            else ("Disputed" if land_detail.is_disputed else "No active dispute")
        ),
        "dispute_history": [
            dispute.flag_reason for dispute in related_disputes if dispute.flag_reason
        ] or (
            ["This land record is marked as disputed."]
            if land_detail.is_disputed
            else ["No dispute history recorded."]
        ),
        "verification_note": (
            latest_log.result_summary
            if latest_log and latest_log.result_summary
            else f"Current registry status: {public_verification_status(land_detail)}."
        ),
    }


class CurrentUserScopedViewSet(viewsets.ModelViewSet):
    def current_user(self):
        return require_current_user(self.request)

    def list(self, request, *args, **kwargs):
        if get_current_user(request) is None:
            return Response(
                {"detail": "Authentication credentials were not provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        if get_current_user(request) is None:
            return Response(
                {"detail": "Authentication credentials were not provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        return super().retrieve(request, *args, **kwargs)


def create_notification(
    *,
    user,
    notification_type,
    notification_title,
    message,
    application=None,
    land_detail=None,
):
    return Notifications.objects.create(
        user=user,
        application=application,
        land_detail=land_detail,
        notification_type=notification_type,
        notification_title=notification_title,
        message=message,
        is_read=False,
        created_at=timezone.now(),
    )


def create_audit_log(*, action_type, action_description, user=None, application=None):
    return AuditLogs.objects.create(
        application=application,
        user=user,
        action_type=action_type,
        action_description=action_description,
        created_at=timezone.now(),
    )


def application_applicant(application):
    return application.user


def payment_reference():
    return f"PAY-{timezone.now().strftime('%Y%m%d%H%M%S%f')}"


def application_expected_payment(application):
    service_type = PaymentsSerializer().validate_service_type(
        application.workflow_type.workflow_name
    )
    amount = PaymentsSerializer.FIXED_SERVICE_FEES.get(service_type)
    return service_type, amount


def application_has_successful_payment(application):
    service_type, amount = application_expected_payment(application)
    if amount is None:
        return False

    return Payments.objects.filter(
        application=application,
        service_type=service_type,
        amount=amount,
        payment_status__iexact="Successful",
    ).exists()


def application_review_notification_type(status_name):
    normalized = (status_name or "").lower()
    if normalized == "approved":
        return "Approval Notice"
    if normalized == "rejected":
        return "Rejection Notice"
    if normalized == "queried":
        return "Admin Query"
    return "Application Update"


def generate_otp_code():
    return f"{random.randint(0, 999999):06d}"


@api_view(['POST'])
def request_otp_view(request):
    serializer = AuthRequestOtpSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = serializer.validated_data["email"]
    purpose = serializer.validated_data.get("purpose") or "Signup"
    otp_code = generate_otp_code()
    now = timezone.now()

    with transaction.atomic():
        OtpVerifications.objects.filter(
            email=email,
            purpose=purpose,
            is_used=False,
        ).update(is_used=True)

        OtpVerifications.objects.create(
            email=email,
            otp_code=otp_code,
            purpose=purpose,
            is_used=False,
            attempt_count=0,
            expires_at=now + timedelta(minutes=10),
            created_at=now,
        )

    try:
        send_mail(
            subject=f"Your {purpose} OTP Code",
            message=(
                f"Your OTP code is {otp_code}. "
                "It will expire in 10 minutes."
            ),
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
            recipient_list=[email],
            fail_silently=False,
        )
    except (smtplib.SMTPException, OSError) as exc:
        error_type = type(exc).__name__
        error_message = str(exc)
        logger.exception(
            "Failed to send OTP email via configured SMTP backend: %s: %s",
            error_type,
            error_message,
        )
        print(
            f"[OTP email error] {error_type}: {error_message}",
            file=sys.stderr,
        )
        return Response(
            {"detail": "Failed to send OTP email. Please try again later."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response({"message": "OTP sent successfully."})


@api_view(['POST'])
def verify_otp_view(request):
    serializer = AuthVerifyOtpSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = serializer.validated_data["email"]
    purpose = serializer.validated_data.get("purpose") or "Signup"
    otp_code = serializer.validated_data["otp_code"]
    now = timezone.now()

    otp = OtpVerifications.objects.filter(
        email=email,
        purpose=purpose,
        is_used=False,
    ).order_by("-created_at", "-otp_id").first()

    if otp is None:
        return Response(
            {"detail": "No valid OTP request was found."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if otp.expires_at < now:
        otp.is_used = True
        otp.save(update_fields=["is_used"])
        return Response(
            {"detail": "OTP has expired. Please request a new OTP."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if otp.otp_code != otp_code:
        otp.attempt_count = (otp.attempt_count or 0) + 1
        update_fields = ["attempt_count"]
        if otp.attempt_count >= 3:
            otp.is_used = True
            update_fields.append("is_used")
        otp.save(update_fields=update_fields)
        return Response(
            {"detail": "Invalid OTP code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    otp.verified_at = now
    otp.save(update_fields=["verified_at"])
    return Response({"message": "OTP verified successfully."})


@api_view(['POST'])
def signup_view(request):
    serializer = AuthSignupSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        return Response(serialize_auth_user(user), status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
def login_view(request):
    serializer = AuthLoginSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.validated_data["user"]
        tokens = generate_jwt_pair(user)
        return Response({
            "access": tokens["access"],
            "refresh": tokens["refresh"],
            "user": serialize_auth_user(user),
        })

    response_status = status.HTTP_400_BAD_REQUEST
    if "non_field_errors" in serializer.errors:
        response_status = status.HTTP_401_UNAUTHORIZED
        if "inactive" in str(serializer.errors["non_field_errors"]).lower():
            response_status = status.HTTP_400_BAD_REQUEST
    return Response(serializer.errors, status=response_status)


@api_view(['GET'])
def me_view(request, user_id):
    current_user = get_current_user(request)
    if current_user is None:
        return Response(
            {"detail": "Authentication credentials were not provided."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if current_user.user_id != user_id and not is_administrator(current_user):
        return permission_denied_response()

    try:
        user = Users.objects.select_related("role").get(user_id=user_id)
    except Users.DoesNotExist:
        return Response(
            {"detail": "User not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    data = serialize_auth_user(user)
    data["is_applicant"] = is_applicant(user)
    data["is_administrator"] = is_administrator(user)
    return Response(data)


class RolesViewSet(viewsets.ModelViewSet):
    queryset = Roles.objects.all()
    serializer_class = RolesSerializer


class UsersViewSet(CurrentUserScopedViewSet):
    queryset = Users.objects.all()
    serializer_class = UsersSerializer

    def get_queryset(self):
        user = self.current_user()
        if is_administrator(user):
            return Users.objects.all()
        return Users.objects.filter(user_id=user.user_id)

    def perform_create(self, serializer):
        user = self.current_user()
        if not is_administrator(user):
            raise serializers.ValidationError(PERMISSION_DENIED_MESSAGE)
        serializer.save()

    def perform_update(self, serializer):
        user = self.current_user()
        if not is_administrator(user):
            raise serializers.ValidationError(PERMISSION_DENIED_MESSAGE)
        serializer.save()


class WorkflowTypesViewSet(viewsets.ModelViewSet):
    queryset = WorkflowTypes.objects.all()
    serializer_class = WorkflowTypesSerializer


class ApplicationStatusesViewSet(viewsets.ModelViewSet):
    queryset = ApplicationStatuses.objects.all()
    serializer_class = ApplicationStatusesSerializer


class ApplicationsViewSet(CurrentUserScopedViewSet):
    queryset = Applications.objects.all()
    serializer_class = ApplicationsSerializer

    def get_queryset(self):
        user = self.current_user()
        queryset = Applications.objects.select_related("user", "workflow_type", "status")
        if is_administrator(user):
            return queryset
        return queryset.filter(user=user)

    def perform_create(self, serializer):
        user = self.current_user()
        now = timezone.now()
        draft_status = find_application_status(APPLICATION_DRAFT_STATUSES)
        save_kwargs = {
            "user": user,
            "submitted_at": serializer.validated_data.get("submitted_at"),
            "created_at": serializer.validated_data.get("created_at") or now,
            "updated_at": serializer.validated_data.get("updated_at") or now,
        }
        if draft_status:
            save_kwargs["status"] = draft_status

        with transaction.atomic():
            application = serializer.save(**save_kwargs)
            applicant = application_applicant(application)
            create_audit_log(
                application=application,
                user=applicant,
                action_type="Application Draft Created",
                action_description=(
                    f"Application {application.application_code} was saved as a draft."
                ),
            )

    def perform_update(self, serializer):
        user = self.current_user()
        application = self.get_object()
        if not user_can_access_application(user, application):
            raise serializers.ValidationError(PERMISSION_DENIED_MESSAGE)
        serializer.save(
            user=application.user,
            updated_at=serializer.validated_data.get("updated_at") or timezone.now(),
        )

    @action(detail=True, methods=['post'], url_path='review')
    def review(self, request, pk=None):
        application = self.get_object()
        admin_id = request.data.get("admin_id")
        new_status_id = request.data.get("new_status_id")
        comment = request.data.get("comment", "")

        if not new_status_id:
            return Response(
                {"detail": "new_status_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        admin_user = get_current_user(request)
        if admin_user is None:
            return Response(
                {"detail": "Authentication credentials were not provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not is_administrator(admin_user):
            return Response(
                {"detail": "Only Administrator users can review applications."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if admin_id and str(admin_id) != str(admin_user.user_id):
            return Response(
                {"detail": "admin_id does not match the current user."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            new_status = ApplicationStatuses.objects.get(status_id=new_status_id)
        except ApplicationStatuses.DoesNotExist:
            return Response(
                {"detail": "Application status not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            old_status = application.status
            now = timezone.now()
            application.status = new_status
            application.reviewed_by = admin_user
            application.reviewed_at = now
            application.remarks = comment or application.remarks
            application.updated_at = now
            application.save(
                update_fields=[
                    "status",
                    "reviewed_by",
                    "reviewed_at",
                    "remarks",
                    "updated_at",
                ]
            )
            review_log = ReviewLogs.objects.create(
                application=application,
                reviewed_by=admin_user,
                old_status=old_status,
                new_status=new_status,
                comment=comment,
                review_date=now,
            )
            create_notification(
                user=application_applicant(application),
                application=application,
                notification_type=application_review_notification_type(
                    new_status.status_name
                ),
                notification_title="Application Reviewed",
                message=comment or f"Your application status is now {new_status.status_name}.",
            )
            create_audit_log(
                application=application,
                user=admin_user,
                action_type="Application Review",
                action_description=(
                    f"Application {application.application_code} changed from "
                    f"{old_status.status_name} to {new_status.status_name}."
                ),
            )

        return Response(
            {
                "application": ApplicationsSerializer(application).data,
                "review_log": ReviewLogsSerializer(review_log).data,
            }
        )

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, pk=None):
        application = self.get_object()
        user = get_current_user(request)

        if user is None:
            return Response(
                {"detail": "Authentication credentials were not provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user_can_access_application(user, application):
            return permission_denied_response(
                "This application does not belong to the current user."
            )

        try:
            has_successful_payment = application_has_successful_payment(application)
        except serializers.ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

        if not has_successful_payment:
            return Response(
                {
                    "detail": (
                        "A successful payment for this application service is "
                        "required before completion."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        submitted_status = find_application_status(APPLICATION_SUBMITTED_STATUSES)
        now = timezone.now()
        update_fields = ["submitted_at", "updated_at"]
        application.submitted_at = now
        application.updated_at = now
        if submitted_status:
            application.status = submitted_status
            update_fields.append("status")
        application.save(update_fields=update_fields)

        create_notification(
            user=application_applicant(application),
            application=application,
            notification_type="Application Update",
            notification_title="Application Submitted",
            message=(
                f"Your application {application.application_code} "
                "has been submitted for administrative review."
            ),
        )

        create_audit_log(
            application=application,
            user=application_applicant(application),
            action_type="Application Submitted",
            action_description=(
                f"Application {application.application_code} was submitted "
                "for administrative review after successful payment."
            ),
        )

        return Response(ApplicationsSerializer(application).data)


class LandDetailsViewSet(CurrentUserScopedViewSet):
    queryset = LandDetails.objects.all()
    serializer_class = LandDetailsSerializer

    def get_queryset(self):
        user = self.current_user()
        queryset = LandDetails.objects.select_related(
            "application",
            "application__user",
            "application__status",
        ).prefetch_related("dispute_flags")

        if is_administrator(user):
            return queryset

        if self.action == "retrieve":
            return queryset.filter(
                public_land_details_filter() | models.Q(application__user=user)
            ).distinct()

        if self.action in {"update", "partial_update", "destroy"}:
            return queryset.filter(application__user=user)

        return queryset.filter(
            public_land_details_filter() | models.Q(application__user=user)
        ).distinct()

    @action(detail=False, methods=['get'], url_path='verification-search')
    def verification_search(self, request):
        user = get_current_user(request)
        if user is None:
            return Response(
                {"detail": "Authentication credentials were not provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        queryset = public_land_details_queryset(
            LandDetails.objects.select_related(
                "application",
                "application__user",
                "application__workflow_type",
                "application__status",
            ).prefetch_related("dispute_flags")
        )
        search_term = (request.query_params.get("search") or "").strip()
        if not search_term:
            return Response([])

        if search_term:
            queryset = queryset.filter(
                models.Q(parcel_number__icontains=search_term)
                | models.Q(plot_number__icontains=search_term)
                | models.Q(property_location__icontains=search_term)
                | models.Q(application__user__full_name__icontains=search_term)
            )

        data = [
            verification_search_record(land_detail)
            for land_detail in queryset.order_by("-updated_at", "-land_detail_id")
        ]
        return Response(data)

    @action(detail=True, methods=['get'], url_path='verification-report')
    def verification_report(self, request, pk=None):
        user = get_current_user(request)
        if user is None:
            return Response(
                {"detail": "Authentication credentials were not provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        land_detail = public_land_details_queryset(
            LandDetails.objects.select_related(
                "application",
                "application__user",
                "application__workflow_type",
                "application__status",
            ).prefetch_related("dispute_flags", "verification_logs")
        ).filter(pk=pk).first()
        if land_detail is None:
            return Response(
                {"detail": "Public verification record not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        search_term = (request.query_params.get("search") or "").strip()
        if not search_term:
            search_term = (
                land_detail.parcel_number
                or land_detail.plot_number
                or str(land_detail.land_detail_id)
            )

        requested_verification_log_id = (
            request.query_params.get("verificationLogId") or ""
        ).strip()
        has_requested_verification_log = bool(requested_verification_log_id)
        verification_log = None
        if requested_verification_log_id.isdigit():
            verification_log = VerificationLogs.objects.filter(
                verification_log_id=requested_verification_log_id,
                user=user,
                land_detail=land_detail,
            ).first()
        invalid_requested_verification_log = (
            has_requested_verification_log and verification_log is None
        )

        payment = None
        if verification_log is not None:
            payment = successful_land_verification_payment(
                user,
                land_detail,
                verification_log,
            )
        elif not has_requested_verification_log:
            payment = successful_land_verification_payment(user, land_detail)

        if verification_log is None and payment is not None:
            verification_log = payment.verification_log

        if verification_log is None and not invalid_requested_verification_log:
            verification_log = VerificationLogs.objects.filter(
                user=user,
                land_detail=land_detail,
            ).order_by("-checked_at", "-verification_log_id").first()
        if verification_log is None:
            verification_log = VerificationLogs.objects.create(
                user=user,
                land_detail=land_detail,
                search_term=search_term,
                result_summary=(
                    "Land verification detail access requested. "
                    "Successful Land Verification payment is required for the full report."
                ),
                checked_at=timezone.now(),
            )
            payment = None

        if (
            payment is None
            and verification_log is not None
            and not invalid_requested_verification_log
        ):
            payment = successful_land_verification_payment(
                user,
                land_detail,
                verification_log,
            )

        if payment is None:
            return Response(
                {
                    "detail": (
                        "A successful Land Verification payment is required "
                        "before viewing the full land details."
                    ),
                    "payment_required": True,
                    "verification_log_id": verification_log.verification_log_id,
                    "land_detail_id": land_detail.land_detail_id,
                    "service_type": "Land Verification",
                    "amount": str(PaymentsSerializer.FIXED_SERVICE_FEES["Land Verification"]),
                }
            )

        verification_log.search_term = search_term
        verification_log.result_summary = (
            f"Full verification report viewed for land detail "
            f"{land_detail.land_detail_id}."
        )
        verification_log.checked_at = timezone.now()
        verification_log.save(
            update_fields=["search_term", "result_summary", "checked_at"]
        )
        return Response(
            verification_report_record(
                land_detail,
                user,
                payment=payment,
                verification_log=verification_log,
            )
        )

    def perform_create(self, serializer):
        user = self.current_user()
        application = serializer.validated_data.get("application")
        if not user_can_access_application(user, application):
            raise serializers.ValidationError(
                "This application does not belong to the current user."
            )
        serializer.save()

    def perform_update(self, serializer):
        user = self.current_user()
        land_detail = self.get_object()
        if not user_can_access_application(user, land_detail.application):
            raise serializers.ValidationError(PERMISSION_DENIED_MESSAGE)
        serializer.save()


class ApplicationPartiesViewSet(CurrentUserScopedViewSet):
    queryset = ApplicationParties.objects.all()
    serializer_class = ApplicationPartiesSerializer

    def get_queryset(self):
        user = self.current_user()
        queryset = ApplicationParties.objects.select_related("application", "application__user")
        if is_administrator(user):
            return queryset
        return queryset.filter(application__user=user)

    def perform_create(self, serializer):
        user = self.current_user()
        application = serializer.validated_data.get("application")
        if not user_can_access_application(user, application):
            raise serializers.ValidationError(
                "This application does not belong to the current user."
            )
        serializer.save()

    def perform_update(self, serializer):
        user = self.current_user()
        party = self.get_object()
        if not user_can_access_application(user, party.application):
            raise serializers.ValidationError(PERMISSION_DENIED_MESSAGE)
        serializer.save()


class DocumentCategoriesViewSet(viewsets.ModelViewSet):
    queryset = DocumentCategories.objects.all()
    serializer_class = DocumentCategoriesSerializer


class DocumentsViewSet(CurrentUserScopedViewSet):
    queryset = Documents.objects.all()
    serializer_class = DocumentsSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.current_user()
        queryset = Documents.objects.select_related("application", "application__user")
        if is_administrator(user):
            return queryset
        return queryset.filter(application__user=user)

    def perform_create(self, serializer):
        user = self.current_user()
        application = serializer.validated_data.get("application")
        if not user_can_access_application(user, application):
            raise serializers.ValidationError(
                "This application does not belong to the current user."
            )
        with transaction.atomic():
            document = serializer.save(
                uploaded_by=user,
                upload_date=serializer.validated_data.get("upload_date") or timezone.now()
            )
            create_audit_log(
                application=document.application,
                user=user,
                action_type="Document Created",
                action_description=(
                    f"Document metadata recorded for {document.document_name}."
                ),
            )

    def perform_update(self, serializer):
        user = self.current_user()
        document = self.get_object()
        if not user_can_access_application(user, document.application):
            raise serializers.ValidationError(PERMISSION_DENIED_MESSAGE)
        serializer.save(uploaded_by=document.uploaded_by)


class PaymentsViewSet(CurrentUserScopedViewSet):
    queryset = Payments.objects.all()
    serializer_class = PaymentsSerializer

    def get_queryset(self):
        user = self.current_user()
        queryset = Payments.objects.select_related(
            "application",
            "application__user",
            "verification_log",
            "verification_log__user",
        )
        if is_administrator(user):
            return queryset
        return queryset.filter(
            models.Q(application__user=user) | models.Q(verification_log__user=user)
        )

    def perform_create(self, serializer):
        user = self.current_user()
        application = serializer.validated_data.get("application")
        verification_log = serializer.validated_data.get("verification_log")

        if application and not application_belongs_to_user(application, user):
            raise serializers.ValidationError(
                "This application does not belong to the current user."
            )

        if verification_log and verification_log.user_id != user.user_id:
            raise serializers.ValidationError(PERMISSION_DENIED_MESSAGE)

        with transaction.atomic():
            payment = serializer.save(
                payment_reference=payment_reference(),
                payment_status="Successful",
                payment_date=serializer.validated_data.get("payment_date") or timezone.now(),
            )
            if payment.application_id:
                applicant = application_applicant(payment.application)
                create_notification(
                    user=applicant,
                    application=payment.application,
                    notification_type="Payment Update",
                    notification_title="Payment Recorded",
                    message=(
                        f"Payment {payment.payment_reference} for application "
                        f"{payment.application.application_code} has been recorded."
                    ),
                )
                create_audit_log(
                    application=payment.application,
                    user=applicant,
                    action_type="Payment Created",
                    action_description=(
                        f"Payment {payment.payment_reference} was recorded with status "
                        f"{payment.payment_status or 'Pending'}."
                    ),
                )
                return

            verification_log = payment.verification_log
            create_notification(
                user=verification_log.user,
                land_detail=verification_log.land_detail,
                notification_type="Payment Update",
                notification_title="Verification Payment Recorded",
                message=(
                    f"Payment {payment.payment_reference} for land verification "
                    f"search '{verification_log.search_term}' has been recorded."
                ),
            )
            create_audit_log(
                user=verification_log.user,
                action_type="Verification Payment Created",
                action_description=(
                    f"Payment {payment.payment_reference} was recorded with status "
                    f"{payment.payment_status or 'Pending'} for verification log "
                    f"{verification_log.verification_log_id}."
                ),
            )

    def perform_update(self, serializer):
        user = self.current_user()
        if not is_administrator(user):
            raise serializers.ValidationError(PERMISSION_DENIED_MESSAGE)
        serializer.save()


class ReviewLogsViewSet(CurrentUserScopedViewSet):
    queryset = ReviewLogs.objects.all()
    serializer_class = ReviewLogsSerializer

    def get_queryset(self):
        user = self.current_user()
        queryset = ReviewLogs.objects.select_related("application", "application__user")
        if is_administrator(user):
            return queryset
        return queryset.filter(application__user=user)


class VerificationLogsViewSet(CurrentUserScopedViewSet):
    queryset = VerificationLogs.objects.all()
    serializer_class = VerificationLogsSerializer

    def get_queryset(self):
        user = self.current_user()
        queryset = VerificationLogs.objects.select_related("user", "land_detail")
        if is_administrator(user):
            return queryset
        return queryset.filter(user=user)

    def perform_create(self, serializer):
        user = self.current_user()
        serializer.save(
            user=user,
            checked_at=serializer.validated_data.get("checked_at") or timezone.now(),
        )

    def perform_update(self, serializer):
        user = self.current_user()
        verification_log = self.get_object()
        if not is_administrator(user) and verification_log.user_id != user.user_id:
            raise serializers.ValidationError(PERMISSION_DENIED_MESSAGE)
        serializer.save(user=verification_log.user)


class AuditLogsViewSet(CurrentUserScopedViewSet):
    queryset = AuditLogs.objects.all()
    serializer_class = AuditLogsSerializer

    def get_queryset(self):
        user = self.current_user()
        queryset = AuditLogs.objects.select_related("application", "application__user", "user")
        if is_administrator(user):
            return queryset
        return queryset.filter(
            models.Q(user=user) | models.Q(application__user=user)
        )


class DisputeFlagsViewSet(CurrentUserScopedViewSet):
    queryset = DisputeFlags.objects.all()
    serializer_class = DisputeFlagsSerializer

    def get_queryset(self):
        user = self.current_user()
        queryset = DisputeFlags.objects.select_related(
            "land_detail",
            "land_detail__application",
            "land_detail__application__user",
            "flagged_by",
        )
        if is_administrator(user):
            return queryset
        return queryset.filter(land_detail__application__user=user)

    def perform_create(self, serializer):
        user = self.current_user()
        if not is_administrator(user):
            raise serializers.ValidationError("Only Administrator users can flag disputes.")
        with transaction.atomic():
            dispute_flag = serializer.save(
                flagged_by=user,
                flagged_at=serializer.validated_data.get("flagged_at") or timezone.now()
            )
            application = dispute_flag.land_detail.application
            applicant = application_applicant(application)
            create_notification(
                user=applicant,
                application=application,
                land_detail=dispute_flag.land_detail,
                notification_type="Disputed Land",
                notification_title="Disputed Land",
                message=dispute_flag.flag_reason,
            )
            create_audit_log(
                application=application,
                user=dispute_flag.flagged_by,
                action_type="Disputed Land",
                action_description=(
                    f"Land detail {dispute_flag.land_detail_id} was flagged as disputed."
                ),
            )

    def perform_update(self, serializer):
        user = self.current_user()
        if not is_administrator(user):
            raise serializers.ValidationError(PERMISSION_DENIED_MESSAGE)
        old_status = self.get_object().flag_status
        with transaction.atomic():
            dispute_flag = serializer.save()
            new_status = dispute_flag.flag_status or ""
            was_unresolved = (old_status or "").lower() != "resolved"
            is_resolved = new_status.lower() == "resolved"

            if is_resolved and was_unresolved:
                if dispute_flag.resolved_at is None:
                    dispute_flag.resolved_at = timezone.now()
                    dispute_flag.save(update_fields=["resolved_at"])

                application = dispute_flag.land_detail.application
                applicant = application_applicant(application)
                create_notification(
                    user=applicant,
                    application=application,
                    land_detail=dispute_flag.land_detail,
                    notification_type="Resolved Land",
                    notification_title="Resolved Land",
                    message=(
                        f"Dispute for land detail {dispute_flag.land_detail_id} "
                        "has been resolved."
                    ),
                )
                create_audit_log(
                    application=application,
                    user=dispute_flag.flagged_by,
                    action_type="Resolved Land",
                    action_description=(
                        f"Dispute flag {dispute_flag.dispute_flag_id} was resolved."
                    ),
                )


class NotificationsViewSet(CurrentUserScopedViewSet):
    queryset = Notifications.objects.all()
    serializer_class = NotificationsSerializer

    def get_queryset(self):
        user = self.current_user()
        queryset = Notifications.objects.select_related("user", "application")
        if is_administrator(user):
            return queryset
        return queryset.filter(user=user)

    def perform_create(self, serializer):
        user = self.current_user()
        if not is_administrator(user):
            raise serializers.ValidationError(PERMISSION_DENIED_MESSAGE)
        serializer.save(created_at=serializer.validated_data.get("created_at") or timezone.now())
