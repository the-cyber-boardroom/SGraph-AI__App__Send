/* =============================================================================
   SGraph Send — Join API Client
   v0.1.8 — Fetch-based client for data room join endpoints

   Endpoints (on user Lambda):
     GET  /join/validate/{invite_code}                — validate invite
     POST /join/accept/{invite_code}                  — accept invite + create session
     GET  /join/session-validate?session_token=...    — validate session
   ============================================================================= */

const JoinAPI = {

    // --- Internal Helpers ---------------------------------------------------

    async _get(path) {
        try {
            const response = await fetch(path, {
                credentials: 'include',
                headers: { 'Accept': 'application/json' }
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || `${response.status} ${response.statusText}`);
            }
            return response.json();
        } catch (e) {
            if (e instanceof TypeError) throw new Error('Network error — server unreachable');
            throw e;
        }
    },

    async _post(path, body) {
        try {
            const response = await fetch(path, {
                method:      'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json',
                           'Accept': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.detail || `${response.status} ${response.statusText}`);
            }
            return response.json();
        } catch (e) {
            if (e instanceof TypeError) throw new Error('Network error — server unreachable');
            throw e;
        }
    },

    // --- Join Flow -----------------------------------------------------------

    validate(inviteCode) {
        return this._get(`/join/validate/${encodeURIComponent(inviteCode)}`);
    },

    accept(inviteCode, userId) {
        return this._post(`/join/accept/${encodeURIComponent(inviteCode)}`, {
            user_id: userId
        });
    },

    validateSession(sessionToken) {
        return this._get(`/join/session-validate?session_token=${encodeURIComponent(sessionToken)}`);
    }
};
