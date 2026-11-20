from django.contrib import admin
from .models import Branch, BranchLocationAudit

@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):

    list_display = (
        'name',
        'code',
        'town',
        'phone',
        'is_active',
    )

    list_filter = ('is_active', 'town')

    search_fields = (
        'name',
        'code',
        'town',
        'phone',
    )

    ordering = ('name',)

@admin.register(BranchLocationAudit)
class BranchLocationAuditAdmin(admin.ModelAdmin):
    list_display = (
        'branch',
        'changed_by',
        'old_attendance_radius',
        'new_attendance_radius',
        'changed_at',
    )

    list_filter = ('branch', 'changed_at')

    readonly_fields = (
        'branch',
        'changed_by',
        'old_latitude',
        'old_longitude',
        'new_latitude',
        'new_longitude',
        'old_attendance_radius',
        'new_attendance_radius',
        'changed_at',
    )
    def has_view_permission(self, request, obj=None):
        return True

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False