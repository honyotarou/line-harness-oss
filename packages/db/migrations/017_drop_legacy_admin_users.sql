-- Legacy password table (pre–admin session JWT). Runtime uses admin session cookies + admin_principal_roles.
DROP TABLE IF EXISTS admin_users;
