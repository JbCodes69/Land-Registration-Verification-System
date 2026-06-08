DROP DATABASE IF EXISTS land_registration_db;
CREATE DATABASE land_registration_db;
USE land_registration_db;

-- =====================================================
-- 1. ROLES TABLE
-- =====================================================
CREATE TABLE roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255)
);

-- =====================================================
-- 2. USERS TABLE
-- =====================================================
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    role_id INT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone_number VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_users_roles
        FOREIGN KEY (role_id)
        REFERENCES roles(role_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

-- =====================================================
-- 3. WORKFLOW TYPES TABLE
-- =====================================================
CREATE TABLE workflow_types (
    workflow_type_id INT AUTO_INCREMENT PRIMARY KEY,
    workflow_name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE
);

-- =====================================================
-- 4. APPLICATION STATUSES TABLE
-- =====================================================
CREATE TABLE application_statuses (
    status_id INT AUTO_INCREMENT PRIMARY KEY,
    status_name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255)
);

-- =====================================================
-- 5. APPLICATIONS TABLE
-- =====================================================
CREATE TABLE applications (
    application_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    workflow_type_id INT NOT NULL,
    status_id INT NOT NULL,
    application_code VARCHAR(100) NOT NULL UNIQUE,
    submitted_at TIMESTAMP NULL,
    reviewed_at TIMESTAMP NULL,
    reviewed_by INT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_applications_users
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_applications_workflow_types
        FOREIGN KEY (workflow_type_id)
        REFERENCES workflow_types(workflow_type_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_applications_statuses
        FOREIGN KEY (status_id)
        REFERENCES application_statuses(status_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_applications_reviewed_by
        FOREIGN KEY (reviewed_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

-- =====================================================
-- 6. APPLICATION PARTIES TABLE
-- =====================================================
CREATE TABLE application_parties (
    party_id INT AUTO_INCREMENT PRIMARY KEY,
    application_id INT NOT NULL,
    party_name VARCHAR(150) NOT NULL,
    party_role VARCHAR(100) NOT NULL,
    contact_details VARCHAR(150),
    address VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_application_parties_applications
        FOREIGN KEY (application_id)
        REFERENCES applications(application_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- =====================================================
-- 7. DOCUMENT CATEGORIES TABLE
-- =====================================================
CREATE TABLE document_categories (
    document_category_id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255)
);

-- =====================================================
-- 8. DOCUMENTS TABLE
-- =====================================================
CREATE TABLE documents (
    document_id INT AUTO_INCREMENT PRIMARY KEY,
    application_id INT NOT NULL,
    document_category_id INT NOT NULL,
    uploaded_by INT NOT NULL,
    document_name VARCHAR(150) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verification_status ENUM('Pending', 'Verified', 'Rejected') DEFAULT 'Pending',
    admin_remark TEXT,

    CONSTRAINT fk_documents_applications
        FOREIGN KEY (application_id)
        REFERENCES applications(application_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_documents_categories
        FOREIGN KEY (document_category_id)
        REFERENCES document_categories(document_category_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_documents_uploaded_by
        FOREIGN KEY (uploaded_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- =====================================================
-- 9. PAYMENTS TABLE
-- =====================================================
CREATE TABLE payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    application_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_status ENUM('Pending', 'Successful', 'Failed') DEFAULT 'Pending',
    payment_reference VARCHAR(100) NOT NULL UNIQUE,
    payment_date TIMESTAMP NULL,
    payment_method VARCHAR(50),

    CONSTRAINT fk_payments_applications
        FOREIGN KEY (application_id)
        REFERENCES applications(application_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- =====================================================
-- 10. LAND DETAILS TABLE
-- =====================================================
CREATE TABLE land_details (
    land_detail_id INT AUTO_INCREMENT PRIMARY KEY,
    application_id INT NOT NULL UNIQUE,
    property_location VARCHAR(255) NOT NULL,
    land_size VARCHAR(100),
    parcel_number VARCHAR(100),
    plot_number VARCHAR(100),
    site_plan_number VARCHAR(100),
    instrument_type VARCHAR(100),
    instrument_date DATE,
    land_description TEXT,
    is_already_registered BOOLEAN DEFAULT FALSE,
    is_disputed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_land_details_applications
        FOREIGN KEY (application_id)
        REFERENCES applications(application_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- ========================================documents=============
-- 11. VERIFICATION LOGS TABLE
-- =====================================================
CREATE TABLE verification_logs (
    verification_log_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    land_detail_id INT NOT NULL,
    search_term VARCHAR(255) NOT NULL,
    result_summary TEXT,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_verification_logs_users
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_verification_logs_land_details
        FOREIGN KEY (land_detail_id)
        REFERENCES land_details(land_detail_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- =====================================================
-- 12. DISPUTE FLAGS TABLE
-- =====================================================
CREATE TABLE dispute_flags (
    dispute_flag_id INT AUTO_INCREMENT PRIMARY KEY,
    land_detail_id INT NOT NULL,
    flag_reason TEXT NOT NULL,
    flag_status ENUM('Disputed', 'Resolved') DEFAULT 'Disputed',
    flagged_by INT NOT NULL,
    flagged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,

    CONSTRAINT fk_dispute_flags_land_details
        FOREIGN KEY (land_detail_id)
        REFERENCES land_details(land_detail_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_dispute_flags_flagged_by
        FOREIGN KEY (flagged_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

-- =====================================================
-- 13. REVIEW LOGS TABLE
-- =====================================================
CREATE TABLE review_logs (
    review_log_id INT AUTO_INCREMENT PRIMARY KEY,
    application_id INT NOT NULL,
    reviewed_by INT NOT NULL,
    old_status_id INT,
    new_status_id INT NOT NULL,
    comment TEXT,
    review_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_review_logs_applications
        FOREIGN KEY (application_id)
        REFERENCES applications(application_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_review_logs_reviewed_by
        FOREIGN KEY (reviewed_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_review_logs_old_status
        FOREIGN KEY (old_status_id)
        REFERENCES application_statuses(status_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_review_logs_new_status
        FOREIGN KEY (new_status_id)
        REFERENCES application_statuses(status_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

-- =====================================================
-- 14. AUDIT LOGS TABLE
-- =====================================================
CREATE TABLE audit_logs (
    audit_log_id INT AUTO_INCREMENT PRIMARY KEY,
    application_id INT,
    user_id INT,
    action_type VARCHAR(100) NOT NULL,
    action_description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_logs_applications
        FOREIGN KEY (application_id)
        REFERENCES applications(application_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_audit_logs_users
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

-- =====================================================
-- DEFAULT LOOKUP DATA
-- =====================================================

INSERT INTO roles (role_name, description)
VALUES
('Applicant', 'User who can submit land service applications and verify land records'),
('Administrator', 'Review officer or administrator who can manage applications and land records');

INSERT INTO workflow_types (workflow_name, description, is_active)
VALUES
('Registration', 'Land registration workflow', TRUE),
('Transfer of Title', 'Transfer of land title workflow', TRUE),
('Concurrence', 'Concurrence application workflow', TRUE),
('Consent', 'Consent application workflow', TRUE);

INSERT INTO application_statuses (status_name, description)
VALUES
('Draft', 'Application has been started but not submitted'),
('Submitted', 'Application has been submitted by applicant'),
('Pending Review', 'Application is awaiting administrative review'),
('Queried', 'Application has issues requiring applicant response'),
('Approved', 'Application has been approved'),
('Rejected', 'Application has been rejected'),
('Registered', 'Land application has been registered'),
('Completed', 'Application workflow has been completed');

INSERT INTO document_categories (category_name, description)
VALUES
('Site Plan', 'Approved site plan or survey document'),
('Ownership Document', 'Document proving ownership or interest in the land'),
('Identification Document', 'Applicant identification document'),
('Transfer Document', 'Document required for transfer of title'),
('Consent Document', 'Document required for consent application'),
('Concurrence Document', 'Document required for concurrence application'),
('Supporting Document', 'Other supporting document for the application');

-- =====================================================
-- SAMPLE TEST DATA
-- =====================================================

INSERT INTO users (
    role_id,
    full_name,
    email,
    phone_number,
    password_hash,
    is_active
)
VALUES
(1, 'Jibril Billy', 'jibril@example.com', '0240000000', 'hashed_password_here', TRUE),
(2, 'Admin Officer', 'admin@example.com', '0241111111', 'hashed_password_here', TRUE);

INSERT INTO applications (
    user_id,
    workflow_type_id,
    status_id,
    application_code,
    submitted_at,
    remarks
)
VALUES
(1, 1, 3, 'APP-REG-001', NOW(), 'Initial registration application submitted for review');

INSERT INTO application_parties (
    application_id,
    party_name,
    party_role,
    contact_details,
    address
)
VALUES
(1, 'Jibril Billy', 'Applicant', '0240000000', 'Accra, Ghana');

INSERT INTO land_details (
    application_id,
    property_location,
    land_size,
    parcel_number,
    plot_number,
    site_plan_number,
    instrument_type,
    instrument_date,
    land_description,
    is_already_registered,
    is_disputed
)
VALUES
(
    1,
    'East Legon, Accra',
    '2 plots',
    'PARCEL-001',
    'PLOT-001',
    'SP-001',
    'Indenture',
    '2024-05-01',
    'Residential land located at East Legon, Accra',
    TRUE,
    FALSE
);

INSERT INTO documents (
    application_id,
    document_category_id,
    uploaded_by,
    document_name,
    file_path,
    verification_status,
    admin_remark
)
VALUES
(1, 1, 1, 'Site Plan', '/uploads/site_plan.pdf', 'Pending', NULL),
(1, 2, 1, 'Ownership Document', '/uploads/ownership_document.pdf', 'Pending', NULL);

INSERT INTO payments (
    application_id,
    amount,
    payment_status,
    payment_reference,
    payment_date,
    payment_method
)
VALUES
(1, 250.00, 'Successful', 'PAY-001', NOW(), 'Mobile Money');

INSERT INTO verification_logs (
    user_id,
    land_detail_id,
    search_term,
    result_summary
)
VALUES
(1, 1, 'PARCEL-001', 'Matching registered land record found');

INSERT INTO review_logs (
    application_id,
    reviewed_by,
    old_status_id,
    new_status_id,
    comment
)
VALUES
(1, 2, 3, 5, 'Application reviewed and approved');

INSERT INTO audit_logs (
    application_id,
    user_id,
    action_type,
    action_description
)
VALUES
(1, 1, 'Application Submission', 'Applicant submitted a registration application'),
(1, 2, 'Administrative Review', 'Administrator reviewed the submitted application');