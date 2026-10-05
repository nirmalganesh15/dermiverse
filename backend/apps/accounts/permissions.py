from rest_framework.permissions import SAFE_METHODS, BasePermission


class CanManage(BasePermission):
    message = "Only the doctor or an administrator can do this."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.can_manage)


class ReadOnlyOrCanManage(BasePermission):
    message = "Only the doctor or an administrator can make changes here."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or request.user.can_manage
