import random
import smtplib
from datetime import timedelta

from django.core.mail import send_mail
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
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
from .auth_helpers import generate_jwt_pair, is_administrator, is_applicant
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
    except (smtplib.SMTPException, OSError):
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


class UsersViewSet(viewsets.ModelViewSet):
    queryset = Users.objects.all()
    serializer_class = UsersSerializer


class WorkflowTypesViewSet(viewsets.ModelViewSet):
    queryset = WorkflowTypes.objects.all()
    serializer_class = WorkflowTypesSerializer


class ApplicationStatusesViewSet(viewsets.ModelViewSet):
    queryset = ApplicationStatuses.objects.all()
    serializer_class = ApplicationStatusesSerializer


class ApplicationsViewSet(viewsets.ModelViewSet):
    queryset = Applications.objects.all()
    serializer_class = ApplicationsSerializer

    def perform_create(self, serializer):
        now = timezone.now()
        with transaction.atomic():
            application = serializer.save(
                submitted_at=serializer.validated_data.get("submitted_at") or now,
                created_at=serializer.validated_data.get("created_at") or now,
                updated_at=serializer.validated_data.get("updated_at") or now,
            )
            applicant = application_applicant(application)
            create_notification(
                user=applicant,
                application=application,
                notification_type="Application Update",
                notification_title="Application Submitted",
                message=(
                    f"Your application {application.application_code} "
                    "has been submitted."
                ),
            )
            create_audit_log(
                application=application,
                user=applicant,
                action_type="Application Submitted",
                action_description=(
                    f"Application {application.application_code} was submitted."
                ),
            )

    @action(detail=True, methods=['post'], url_path='review')
    def review(self, request, pk=None):
        application = self.get_object()
        admin_id = request.data.get("admin_id")
        new_status_id = request.data.get("new_status_id")
        comment = request.data.get("comment", "")

        if not admin_id or not new_status_id:
            return Response(
                {"detail": "admin_id and new_status_id are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            admin_user = Users.objects.select_related("role").get(user_id=admin_id)
        except Users.DoesNotExist:
            return Response(
                {"detail": "Admin user not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not is_administrator(admin_user):
            return Response(
                {"detail": "Only Administrator users can review applications."},
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


class LandDetailsViewSet(viewsets.ModelViewSet):
    queryset = LandDetails.objects.all()
    serializer_class = LandDetailsSerializer


class ApplicationPartiesViewSet(viewsets.ModelViewSet):
    queryset = ApplicationParties.objects.all()
    serializer_class = ApplicationPartiesSerializer


class DocumentCategoriesViewSet(viewsets.ModelViewSet):
    queryset = DocumentCategories.objects.all()
    serializer_class = DocumentCategoriesSerializer


class DocumentsViewSet(viewsets.ModelViewSet):
    queryset = Documents.objects.all()
    serializer_class = DocumentsSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def perform_create(self, serializer):
        with transaction.atomic():
            document = serializer.save(
                upload_date=serializer.validated_data.get("upload_date") or timezone.now()
            )
            create_audit_log(
                application=document.application,
                user=document.uploaded_by,
                action_type="Document Created",
                action_description=(
                    f"Document metadata recorded for {document.document_name}."
                ),
            )


class PaymentsViewSet(viewsets.ModelViewSet):
    queryset = Payments.objects.all()
    serializer_class = PaymentsSerializer

    def perform_create(self, serializer):
        reference = serializer.validated_data.get("payment_reference")
        with transaction.atomic():
            payment = serializer.save(
                payment_reference=reference or payment_reference(),
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


class ReviewLogsViewSet(viewsets.ModelViewSet):
    queryset = ReviewLogs.objects.all()
    serializer_class = ReviewLogsSerializer


class VerificationLogsViewSet(viewsets.ModelViewSet):
    queryset = VerificationLogs.objects.all()
    serializer_class = VerificationLogsSerializer


class AuditLogsViewSet(viewsets.ModelViewSet):
    queryset = AuditLogs.objects.all()
    serializer_class = AuditLogsSerializer


class DisputeFlagsViewSet(viewsets.ModelViewSet):
    queryset = DisputeFlags.objects.all()
    serializer_class = DisputeFlagsSerializer

    def perform_create(self, serializer):
        with transaction.atomic():
            dispute_flag = serializer.save(
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


class NotificationsViewSet(viewsets.ModelViewSet):
    queryset = Notifications.objects.all()
    serializer_class = NotificationsSerializer
