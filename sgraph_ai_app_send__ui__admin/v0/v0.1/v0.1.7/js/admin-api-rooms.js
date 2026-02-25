/* =============================================================================
   SGraph Send Admin Console — Data Room API Extension
   v0.1.7 — Extends adminAPI with room, invite, and audit endpoints

   Endpoints:
     Room Management:
       POST /rooms/create                              — create a new data room
       GET  /rooms/lookup/{room_id}                    — get room details
       GET  /rooms/list                                — list all active rooms
       POST /rooms/archive/{room_id}                   — soft-delete a room

     Member Management:
       GET  /rooms/members/{room_id}                   — list room members
       POST /rooms/members-add/{room_id}               — add member to room
       DELETE /rooms/members-remove/{room_id}/{user_id} — remove member

     Invites:
       POST /rooms/invite/{room_id}                    — generate invite code
       GET  /invites/validate/{invite_code}            — check invite validity
       POST /invites/accept/{invite_code}              — accept invite, join room
       POST /invites/expire/{invite_code}              — manually expire invite

     Audit:
       GET  /rooms/audit/{room_id}                     — get room audit trail
   ============================================================================= */

(function() {
    'use strict';

    // --- Room Lifecycle ---

    adminAPI.roomCreate = function(name, ownerUserId, description) {
        return this._post('/rooms/create', {
            name          : name,
            owner_user_id : ownerUserId,
            description   : description || ''
        });
    };

    adminAPI.roomLookup = function(roomId) {
        return this._get(`/rooms/lookup/${encodeURIComponent(roomId)}`);
    };

    adminAPI.roomList = function() {
        return this._get('/rooms/list');
    };

    adminAPI.roomArchive = function(roomId) {
        return this._post(`/rooms/archive/${encodeURIComponent(roomId)}`);
    };

    // --- Member Management ---

    adminAPI.roomMembers = function(roomId) {
        return this._get(`/rooms/members/${encodeURIComponent(roomId)}`);
    };

    adminAPI.roomAddMember = function(roomId, userId, permission, grantedBy) {
        return this._post(`/rooms/members-add/${encodeURIComponent(roomId)}`, {
            user_id    : userId,
            permission : permission || 'viewer',
            granted_by : grantedBy || ''
        });
    };

    adminAPI.roomRemoveMember = function(roomId, userId) {
        return this._delete(`/rooms/members-remove/${encodeURIComponent(roomId)}/${encodeURIComponent(userId)}`);
    };

    // --- Invite Management ---

    adminAPI.roomCreateInvite = function(roomId, permission, createdBy, maxUses) {
        return this._post(`/rooms/invite/${encodeURIComponent(roomId)}`, {
            permission : permission || 'viewer',
            created_by : createdBy || '',
            max_uses   : maxUses   ?? 1
        });
    };

    adminAPI.inviteValidate = function(inviteCode) {
        return this._get(`/invites/validate/${encodeURIComponent(inviteCode)}`);
    };

    adminAPI.inviteAccept = function(inviteCode, userId) {
        return this._post(`/invites/accept/${encodeURIComponent(inviteCode)}`, {
            user_id : userId
        });
    };

    adminAPI.inviteExpire = function(inviteCode) {
        return this._post(`/invites/expire/${encodeURIComponent(inviteCode)}`);
    };

    // --- Audit ---

    adminAPI.roomAudit = function(roomId) {
        return this._get(`/rooms/audit/${encodeURIComponent(roomId)}`);
    };

})();
