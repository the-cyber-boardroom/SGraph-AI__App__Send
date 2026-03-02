# ===============================================================================
# SGraph Send - Early Access Signup Service
# Sends notification email via n8n WorkMail webhook when users sign up
# ===============================================================================

import re
from datetime                   import datetime, timezone
from osbot_utils.type_safe.Type_Safe import Type_Safe

TAG__EARLY_ACCESS = 'api/early-access'

class Service__Early_Access(Type_Safe):
    n8n_webhook_url    : str = ''                                                   # e.g. https://dinis-cruz.app.n8n.cloud/webhook/workmail
    n8n_webhook_secret : str = ''                                                   # X-Webhook-Secret header value

    def validate_signup(self, name: str, email: str) -> dict:                       # Returns {valid: bool, errors: [str]}
        errors = []
        if not name or not name.strip():
            errors.append('Name is required')
        if not email or not self._is_valid_email(email):
            errors.append('A valid email address is required')
        return dict(valid  = len(errors) == 0,
                    errors = errors            )

    def _is_valid_email(self, email: str) -> bool:                                  # Basic email format check
        return bool(re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email))

    def build_email_body(self, name: str, email: str, locale: str = '') -> dict:    # Build the notification email payload
        timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
        subject   = f'[SG/Send] New Early Access Signup: {name}'
        body      = (f'New Early Access signup received.<br><br>'
                     f'<b>Name:</b>      {name}<br>'
                     f'<b>Email:</b>     {email}<br>'
                     f'<b>Signed up:</b> {timestamp}<br>'
                     f'<b>Locale:</b>    {locale or "not detected"}<br>')
        return dict(subject   = subject  ,
                    body      = body     ,
                    timestamp = timestamp)

    def send_notification(self, name: str, email: str, locale: str = '') -> dict:   # Send email via n8n webhook
        email_data = self.build_email_body(name, email, locale)
        results    = []

        for account, to_address in [('sherpa', 'sherpa.explorer@sgraph.ai'),
                                    ('dinis' , 'dinis.cruz@owasp.org'     )]:
            payload = dict(account   = account                ,
                           operation = 'send_email'           ,
                           to        = to_address             ,
                           subject   = email_data['subject']  ,
                           body      = email_data['body']     )
            result = self._call_webhook(payload)
            results.append(dict(account = account, success = result.get('success', False)))

        return dict(notifications = results,
                    timestamp     = email_data['timestamp'])

    def _call_webhook(self, payload: dict) -> dict:                                 # POST to n8n webhook
        import urllib.request
        import json

        if not self.n8n_webhook_url:
            return dict(success = False, error = 'n8n webhook URL not configured')

        data    = json.dumps(payload).encode('utf-8')
        headers = {'Content-Type': 'application/json'}
        if self.n8n_webhook_secret:
            headers['X-Webhook-Secret'] = self.n8n_webhook_secret

        req = urllib.request.Request(self.n8n_webhook_url  ,
                                     data    = data        ,
                                     headers = headers     ,
                                     method  = 'POST'      )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                response_body = resp.read().decode('utf-8')
                return dict(success     = True         ,
                            status_code = resp.status  ,
                            body        = response_body)
        except Exception as e:
            return dict(success = False ,
                        error   = str(e))
