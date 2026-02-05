import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';

/** Default permissions granted to each role when user has no custom permissions */
const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  superadmin: ['*'],
  admin: [
    'patients:read',
    'patients:write',
    'appointments:manage',
    'dentists:manage',
    'services:manage',
    'reports:view',
    'settings:manage',
    'billing:manage',
    'conversations:manage',
    'odontogram:write',
  ],
  user: [
    'patients:read',
    'patients:write',
    'appointments:manage',
    'reports:view',
    'conversations:manage',
    'odontogram:write',
  ],
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Superadmin bypasses all permission checks
    if (user.role === 'superadmin') {
      return true;
    }

    const userPermissions: string[] =
      user.permissions && user.permissions.length > 0
        ? user.permissions
        : DEFAULT_PERMISSIONS[user.role] || [];

    // Wildcard grants all permissions
    if (userPermissions.includes('*')) {
      return true;
    }

    const hasPermission = requiredPermissions.some((perm) => userPermissions.includes(perm));

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}

export { DEFAULT_PERMISSIONS };
