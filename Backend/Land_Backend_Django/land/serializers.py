from decimal import Decimal

from rest_framework import serializers
from django.contrib.auth.hashers import check_password, make_password
from django.conf import settings
from django.core.files.storage import default_storage
from django.utils import timezone
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


def serialize_auth_user(user):
    return {
        "user_id": user.user_id,
        "full_name": user.full_name,
        "email": user.email,
        "phone_number": user.phone_number,
        "role_id": user.role_id,
        "role_name": user.role.role_name if user.role else None,
        "is_active": user.is_active,
    }


class RolesSerializer(serializers.ModelSerializer):
    class Meta:
        model = Roles
        fields = '__all__'


class UsersSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source='role.role_name', read_only=True)

    class Meta:
        model = Users
        exclude = ['password_hash']


class AuthSignupSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField(max_length=150)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=6)
    role_id = serializers.IntegerField(required=False)
    otp_code = serializers.CharField(write_only=True, max_length=10)

    def validate_email(self, value):
        email = value.strip().lower()
        if Users.objects.filter(email=email).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return email

    def validate_role_id(self, value):
        if not Roles.objects.filter(role_id=value).exists():
            raise serializers.ValidationError("Invalid role_id.")
        return value

    def validate_otp_code(self, value):
        if not value.strip():
            raise serializers.ValidationError("OTP code is required.")
        return value.strip()

    def create(self, validated_data):
        role_id = validated_data.pop("role_id", None)
        otp_code = validated_data.pop("otp_code")
        if role_id:
            role = Roles.objects.get(role_id=role_id)
        else:
            role = Roles.objects.filter(role_name__iexact="Applicant").first()
            if role is None:
                raise serializers.ValidationError({
                    "role_id": "Default Applicant role was not found."
                })

        now = timezone.now()
        otp = OtpVerifications.objects.filter(
            email=validated_data["email"],
            purpose="Signup",
            otp_code=otp_code,
            is_used=False,
            verified_at__isnull=False,
            expires_at__gte=now,
        ).order_by("-created_at", "-otp_id").first()
        if otp is None:
            raise serializers.ValidationError({
                "otp_code": (
                    "OTP has not been verified, has expired, or has already been used."
                )
            })

        otp.is_used = True
        otp.save(update_fields=["is_used"])
        return Users.objects.create(
            role=role,
            full_name=validated_data["full_name"],
            email=validated_data["email"],
            phone_number=validated_data.get("phone_number") or None,
            password_hash=make_password(validated_data["password"]),
            is_active=True,
            created_at=now,
            updated_at=now,
        )

    def to_representation(self, instance):
        return serialize_auth_user(instance)


class AuthRequestOtpSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=150)
    purpose = serializers.CharField(max_length=14, required=False, allow_blank=True)

    def validate_email(self, value):
        return value.strip().lower()

    def validate_purpose(self, value):
        purpose = value.strip() if value else "Signup"
        allowed = {"Signup", "Password Reset"}
        if purpose not in allowed:
            raise serializers.ValidationError(
                "purpose must be Signup or Password Reset."
            )
        return purpose


class AuthVerifyOtpSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=150)
    otp_code = serializers.CharField(max_length=10)
    purpose = serializers.CharField(max_length=14, required=False, allow_blank=True)

    def validate_email(self, value):
        return value.strip().lower()

    def validate_otp_code(self, value):
        if not value.strip():
            raise serializers.ValidationError("OTP code is required.")
        return value.strip()

    def validate_purpose(self, value):
        purpose = value.strip() if value else "Signup"
        allowed = {"Signup", "Password Reset"}
        if purpose not in allowed:
            raise serializers.ValidationError(
                "purpose must be Signup or Password Reset."
            )
        return purpose


class AuthLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs["email"].strip().lower()
        password = attrs["password"]

        user = Users.objects.filter(email=email).select_related("role").first()
        if user is None:
            raise serializers.ValidationError("Invalid email or password.")

        if not user.is_active:
            raise serializers.ValidationError("This account is inactive.")

        if not check_password(password, user.password_hash):
            raise serializers.ValidationError("Invalid email or password.")

        attrs["user"] = user
        return attrs


class WorkflowTypesSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowTypes
        fields = '__all__'


class ApplicationStatusesSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicationStatuses
        fields = '__all__'


class ApplicationsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Applications
        fields = '__all__'


class LandDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = LandDetails
        fields = '__all__'


class ApplicationPartiesSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicationParties
        fields = '__all__'


class DocumentCategoriesSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentCategories
        fields = '__all__'


class DocumentsSerializer(serializers.ModelSerializer):
    application_id = serializers.PrimaryKeyRelatedField(
        source="application",
        queryset=Applications.objects.all(),
        required=True,
    )
    document_category_id = serializers.PrimaryKeyRelatedField(
        source="document_category",
        queryset=DocumentCategories.objects.all(),
        required=True,
    )
    uploaded_by = serializers.PrimaryKeyRelatedField(
        queryset=Users.objects.all(),
        required=True,
    )
    file = serializers.FileField(write_only=True, required=False)
    file_url = serializers.SerializerMethodField()

    def to_internal_value(self, data):
        data = data.copy()
        if "application_id" not in data and "application" in data:
            data["application_id"] = data["application"]
        if "document_category_id" not in data and "document_category" in data:
            data["document_category_id"] = data["document_category"]
        return super().to_internal_value(data)

    def validate(self, attrs):
        if self.instance is None and not attrs.get("file"):
            raise serializers.ValidationError({"file": "A document file is required."})
        return attrs

    def validate_verification_status(self, value):
        if not value:
            return value
        normalized = value.strip().title()
        allowed = {"Pending", "Verified", "Rejected"}
        if normalized not in allowed:
            raise serializers.ValidationError(
                "verification_status must be Pending, Verified, or Rejected."
            )
        return normalized

    def create(self, validated_data):
        uploaded_file = validated_data.pop("file")
        saved_path = default_storage.save(f"documents/{uploaded_file.name}", uploaded_file)
        validated_data["file_path"] = f"{settings.MEDIA_URL}{saved_path}"
        return super().create(validated_data)

    def get_file_url(self, obj):
        if not obj.file_path:
            return None

        file_path = obj.file_path
        if file_path.startswith(("http://", "https://")):
            url = file_path
        elif file_path.startswith(settings.MEDIA_URL):
            url = file_path
        else:
            url = f"{settings.MEDIA_URL}{file_path.lstrip('/')}"

        request = self.context.get("request")
        if request is not None:
            return request.build_absolute_uri(url)
        return url

    class Meta:
        model = Documents
        fields = [
            "document_id",
            "application_id",
            "document_category_id",
            "uploaded_by",
            "document_name",
            "file_path",
            "file_url",
            "file",
            "upload_date",
            "verification_status",
            "admin_remark",
        ]
        read_only_fields = ["document_id", "file_path", "file_url", "upload_date"]


class PaymentsSerializer(serializers.ModelSerializer):
    FIXED_SERVICE_FEES = {
        "Land Verification": Decimal("5.00"),
        "Consent": Decimal("10.00"),
        "Concurrence": Decimal("15.00"),
        "Land Registration": Decimal("20.00"),
        "Transfer of Title": Decimal("25.00"),
    }

    application_id = serializers.PrimaryKeyRelatedField(
        source="application",
        queryset=Applications.objects.all(),
        required=False,
        allow_null=True,
    )
    verification_log_id = serializers.PrimaryKeyRelatedField(
        source="verification_log",
        queryset=VerificationLogs.objects.all(),
        required=False,
        allow_null=True,
    )

    def to_internal_value(self, data):
        data = data.copy()
        if "application_id" not in data and "application" in data:
            data["application_id"] = data["application"]
        if "verification_log_id" not in data and "verification_log" in data:
            data["verification_log_id"] = data["verification_log"]
        return super().to_internal_value(data)

    def validate_payment_status(self, value):
        if not value:
            return value
        aliases = {
            "paid": "Successful",
            "success": "Successful",
            "successful": "Successful",
            "pending": "Pending",
            "failed": "Failed",
        }
        normalized = aliases.get(value.strip().lower())
        if normalized is None:
            raise serializers.ValidationError(
                "payment_status must be Pending, Successful, or Failed."
            )
        return normalized

    def validate_service_type(self, value):
        if not value:
            return value

        aliases = {
            "verification": "Land Verification",
            "land verification": "Land Verification",
            "consent": "Consent",
            "concurrence": "Concurrence",
            "registration": "Land Registration",
            "land registration": "Land Registration",
            "transfer": "Transfer of Title",
            "transfer of title": "Transfer of Title",
        }
        normalized = aliases.get(value.strip().lower())
        if normalized is None:
            raise serializers.ValidationError(
                "service_type must be Land Verification, Consent, Concurrence, "
                "Land Registration, or Transfer of Title."
            )
        return normalized

    def validate(self, attrs):
        application = attrs.get("application")
        verification_log = attrs.get("verification_log")

        if self.instance is not None:
            application = application if "application" in attrs else self.instance.application
            verification_log = (
                verification_log
                if "verification_log" in attrs
                else self.instance.verification_log
            )

        if bool(application) == bool(verification_log):
            raise serializers.ValidationError(
                "Provide exactly one of application_id or verification_log_id."
            )

        service_type = attrs.get("service_type")
        if not service_type and application:
            service_type = application.workflow_type.workflow_name
            attrs["service_type"] = self.validate_service_type(service_type)
        elif not service_type and verification_log:
            service_type = "Land Verification"
            attrs["service_type"] = service_type

        if verification_log and attrs["service_type"] != "Land Verification":
            raise serializers.ValidationError(
                "verification_log_id payments must use service_type Land Verification."
            )

        expected_amount = self.FIXED_SERVICE_FEES.get(attrs["service_type"])
        if expected_amount is None:
            raise serializers.ValidationError(
                "A supported service_type is required for payment."
            )

        amount = attrs.get("amount")
        if amount is not None and Decimal(amount).quantize(Decimal("0.01")) != expected_amount:
            raise serializers.ValidationError({
                "amount": f"{attrs['service_type']} fee must be GHS {expected_amount}."
            })

        return attrs

    class Meta:
        model = Payments
        fields = [
            "payment_id",
            "application",
            "application_id",
            "verification_log",
            "verification_log_id",
            "service_type",
            "amount",
            "payment_status",
            "payment_reference",
            "payment_date",
            "payment_method",
        ]
        read_only_fields = ["payment_id", "application", "verification_log"]
        extra_kwargs = {
            'payment_reference': {'required': False, 'allow_blank': True},
        }


class ReviewLogsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReviewLogs
        fields = '__all__'


class VerificationLogsSerializer(serializers.ModelSerializer):
    class Meta:
        model = VerificationLogs
        fields = '__all__'


class AuditLogsSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLogs
        fields = '__all__'


class DisputeFlagsSerializer(serializers.ModelSerializer):
    def validate_flag_status(self, value):
        if not value:
            return value
        aliases = {
            "open": "Disputed",
            "disputed": "Disputed",
            "resolved": "Resolved",
        }
        normalized = aliases.get(value.strip().lower())
        if normalized is None:
            raise serializers.ValidationError(
                "flag_status must be Disputed or Resolved."
            )
        return normalized

    class Meta:
        model = DisputeFlags
        fields = '__all__'


class NotificationsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notifications
        fields = '__all__'
