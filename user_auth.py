"""Read-only authentication against the supplied synthetic user database."""
import base64
import hashlib
import hmac
import json
import shutil
import sqlite3
from contextlib import closing


class UserAuth:
    def __init__(self, root):
        self.path = root / 'private/users.demo.sqlite3'
        if not self.path.exists():
            self.path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(root / 'user-db/users.demo.sqlite3', self.path)

    def lookup(self, field, value):
        if field not in ('user_id', 'username'):
            raise ValueError('Invalid lookup')
        with closing(sqlite3.connect(self.path.as_uri() + '?mode=ro', uri=True)) as db:
            db.row_factory = sqlite3.Row
            row = db.execute(f'''SELECT u.*, c.company_name,
                r.allowed_security_levels_json, r.allowed_document_kinds_json
                FROM users u JOIN companies c ON u.company_id=c.company_id AND u.tenant_id=c.tenant_id
                JOIN roles r ON u.role_id=r.role_id WHERE u.{field}=?''', (value,)).fetchone()
        return dict(row) if row else None

    def public_user(self, row):
        if not row or row['account_status'] != 'active' or not row['membership_active']:
            return None
        return dict(user_id=row['user_id'], username=row['username'], employee_id=row['username'],
                    name=row['display_name'], display_name=row['display_name'],
                    company_code=row['company_id'], tenant_id=row['tenant_id'],
                    company_name=row['company_name'], role=row['role_id'],
                    allowed_security_levels=json.loads(row['allowed_security_levels_json']),
                    allowed_document_kinds=json.loads(row['allowed_document_kinds_json']),
                    can_compare=row['company_id']=='C01' and row['role_id']=='bid_approver')

    def current(self, user_id):
        return self.public_user(self.lookup('user_id', user_id))

    def demo_login_options(self):
        """Only synthetic display fields; never return password material."""
        with closing(sqlite3.connect(self.path.as_uri() + '?mode=ro', uri=True)) as db:
            db.row_factory = sqlite3.Row
            rows = db.execute('''SELECT c.company_id, c.company_name, u.username,
                u.display_name, r.label AS role_label, u.account_status, u.membership_active
                FROM users u JOIN companies c ON u.company_id=c.company_id AND u.tenant_id=c.tenant_id
                JOIN roles r ON u.role_id=r.role_id
                WHERE u.synthetic=1 AND c.synthetic=1 ORDER BY c.company_id,u.user_id''').fetchall()
        companies = {}
        for row in rows:
            company = companies.setdefault(row['company_id'], dict(company_code=row['company_id'],company_name=row['company_name'],users=[]))
            company['users'].append(dict(username=row['username'],display_name=row['display_name'],role_label=row['role_label'],active=row['account_status']=='active' and bool(row['membership_active'])))
        return list(companies.values())

    def login(self, company, username, password):
        row = self.lookup('username', username)
        if not row:
            hashlib.pbkdf2_hmac('sha256', password.encode(), b'unknown-account!', 310000)
            return None
        if row['password_algorithm'] != 'pbkdf2_sha256':
            return None
        salt = base64.b64decode(row['password_salt'], validate=True)
        expected = base64.b64decode(row['password_hash'], validate=True)
        actual = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, row['password_iterations'])
        if not hmac.compare_digest(expected, actual) or row['company_id'] != company:
            return None
        return self.public_user(row)
