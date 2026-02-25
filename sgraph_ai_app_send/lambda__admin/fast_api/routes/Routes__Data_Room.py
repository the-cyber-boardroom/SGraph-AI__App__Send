# ===============================================================================
# SGraph Send - Data Room Routes
# REST endpoints for data room management (admin Lambda)
# ===============================================================================

from   fastapi                                                                      import HTTPException
from   osbot_fast_api.api.routes.Fast_API__Routes                                  import Fast_API__Routes
from   osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id  import Safe_Str__Id
from   sgraph_ai_app_send.lambda__admin.schemas.Schema__Data_Room__Create__Request import Schema__Data_Room__Create__Request
from   sgraph_ai_app_send.lambda__admin.schemas.Schema__Invite__Create__Request    import Schema__Invite__Create__Request
from   sgraph_ai_app_send.lambda__admin.schemas.Schema__Room__Member__Request      import Schema__Room__Member__Request
from   sgraph_ai_app_send.lambda__admin.service.Service__Data_Room                 import Service__Data_Room
from   sgraph_ai_app_send.lambda__admin.service.Service__Invites                   import Service__Invites
from   sgraph_ai_app_send.lambda__admin.service.Service__Audit                     import Service__Audit

TAG__ROUTES_ROOMS = 'rooms'

ROUTES_PATHS__ROOMS = [f'/{TAG__ROUTES_ROOMS}/create'                             ,
                       f'/{TAG__ROUTES_ROOMS}/lookup/{{room_id}}'                 ,
                       f'/{TAG__ROUTES_ROOMS}/list'                               ,
                       f'/{TAG__ROUTES_ROOMS}/archive/{{room_id}}'                ,
                       f'/{TAG__ROUTES_ROOMS}/members/{{room_id}}'                ,
                       f'/{TAG__ROUTES_ROOMS}/members-add/{{room_id}}'            ,
                       f'/{TAG__ROUTES_ROOMS}/members-remove/{{room_id}}/{{user_id}}' ,
                       f'/{TAG__ROUTES_ROOMS}/invite/{{room_id}}'                 ,
                       f'/{TAG__ROUTES_ROOMS}/audit/{{room_id}}'                  ]


class Routes__Data_Room(Fast_API__Routes):                                   # Data room management endpoints
    tag                : str = TAG__ROUTES_ROOMS
    service_data_room  : Service__Data_Room                                  # Injected room service
    service_invites    : Service__Invites                                    # Injected invite service
    service_audit      : Service__Audit                                      # Injected audit service

    # ═══════════════════════════════════════════════════════════════════════
    # Room CRUD
    # ═══════════════════════════════════════════════════════════════════════

    def create(self, body: Schema__Data_Room__Create__Request) -> dict:      # POST /rooms/create
        if not body.name:
            raise HTTPException(status_code=400, detail='name is required')
        if not body.owner_user_id:
            raise HTTPException(status_code=400, detail='owner_user_id is required')
        result = self.service_data_room.create_room(
            body.name, body.owner_user_id, body.description)
        if result is None:
            raise HTTPException(status_code=500, detail='Failed to create room')

        self.service_audit.log(result['room_id'], body.owner_user_id, 'room.created')
        return result

    def lookup__room_id(self, room_id: Safe_Str__Id) -> dict:               # GET /rooms/lookup/{room_id}
        result = self.service_data_room.get_room(room_id)
        if result is None:
            raise HTTPException(status_code=404, detail='Room not found')
        return result

    def list(self) -> dict:                                                  # GET /rooms/list
        rooms = self.service_data_room.list_rooms()
        return dict(rooms=rooms, count=len(rooms))

    def archive__room_id(self, room_id: Safe_Str__Id) -> dict:              # POST /rooms/archive/{room_id}
        room_data = self.service_data_room.get_room(room_id)
        if room_data is None:
            raise HTTPException(status_code=404, detail='Room not found')
        owner = room_data.get('owner_user_id', '')
        result = self.service_data_room.archive_room(room_id, owner)
        if not result.get('success'):
            raise HTTPException(status_code=403, detail=result.get('reason', 'Failed'))
        self.service_audit.log(room_id, owner, 'room.archived')
        return result

    # ═══════════════════════════════════════════════════════════════════════
    # Member Management
    # ═══════════════════════════════════════════════════════════════════════

    def members__room_id(self, room_id: Safe_Str__Id) -> dict:              # GET /rooms/members/{room_id}
        members = self.service_data_room.get_members(room_id)
        if members is None:
            raise HTTPException(status_code=404, detail='Room not found')
        return dict(room_id=room_id, members=members, count=len(members))

    def members_add__room_id(self, room_id: Safe_Str__Id,                   # POST /rooms/members-add/{room_id}
                             body: Schema__Room__Member__Request) -> dict:
        result = self.service_data_room.add_member(
            room_id, body.user_id, body.permission, body.granted_by)
        if not result.get('success'):
            status = 404 if result.get('reason') == 'room_not_found' else 403
            raise HTTPException(status_code=status, detail=result.get('reason', 'Failed'))
        self.service_audit.log(room_id, body.granted_by, 'member.added',
                               target_guid=body.user_id)
        return result

    def members_remove__room_id__user_id(self, room_id: Safe_Str__Id,       # DELETE /rooms/members-remove/{room_id}/{user_id}
                                          user_id: Safe_Str__Id) -> dict:
        room_data = self.service_data_room.get_room(room_id)
        if room_data is None:
            raise HTTPException(status_code=404, detail='Room not found')
        owner = room_data.get('owner_user_id', '')
        result = self.service_data_room.remove_member(room_id, user_id, owner)
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('reason', 'Failed'))
        self.service_audit.log(room_id, owner, 'member.removed', target_guid=user_id)
        return result

    # ═══════════════════════════════════════════════════════════════════════
    # Invite Generation
    # ═══════════════════════════════════════════════════════════════════════

    def invite__room_id(self, room_id: Safe_Str__Id,                        # POST /rooms/invite/{room_id}
                        body: Schema__Invite__Create__Request) -> dict:
        result = self.service_invites.create_invite(
            room_id, body.permission, body.created_by, body.max_uses)
        if result is None:
            raise HTTPException(status_code=404, detail='Room not found or archived')
        self.service_audit.log(room_id, body.created_by, 'invite.created',
                               target_guid=result.get('invite_code', ''))
        return result

    # ═══════════════════════════════════════════════════════════════════════
    # Audit Trail
    # ═══════════════════════════════════════════════════════════════════════

    def audit__room_id(self, room_id: Safe_Str__Id) -> dict:                # GET /rooms/audit/{room_id}
        events = self.service_audit.get_room_events(room_id)
        return dict(room_id=room_id, events=events, count=len(events))

    # ═══════════════════════════════════════════════════════════════════════
    # Route Registration
    # ═══════════════════════════════════════════════════════════════════════

    def setup_routes(self):                                                  # Register all room endpoints
        self.add_route_post  (self.create                                   )
        self.add_route_get   (self.lookup__room_id                          )
        self.add_route_get   (self.list                                     )
        self.add_route_post  (self.archive__room_id                         )
        self.add_route_get   (self.members__room_id                         )
        self.add_route_post  (self.members_add__room_id                     )
        self.add_route_delete(self.members_remove__room_id__user_id         )
        self.add_route_post  (self.invite__room_id                          )
        self.add_route_get   (self.audit__room_id                           )
        return self
