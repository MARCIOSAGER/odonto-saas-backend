import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

@WebSocketGateway({
  cors: {
    origin: ['https://odonto.marciosager.com', 'http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    const redisHost = this.configService.get<string>('REDIS_HOST');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');

    if (redisHost) {
      try {
        const pubClient = new Redis({
          host: redisHost,
          port: redisPort,
          password: redisPassword || undefined,
        });
        const subClient = pubClient.duplicate();

        server.adapter(createAdapter(pubClient, subClient) as any);
        this.logger.log('Socket.IO Redis adapter configured');
      } catch (error) {
        this.logger.warn(`Failed to configure Redis adapter, using in-memory: ${error}`);
      }
    } else {
      this.logger.log('Socket.IO using in-memory adapter (no REDIS_HOST set)');
    }
  }

  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.query.token as string) ||
        client.handshake.auth?.token ||
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Connection rejected: no token (${client.id})`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      const userId = payload.sub;

      if (!userId) {
        this.logger.warn(`Connection rejected: invalid token (${client.id})`);
        client.disconnect();
        return;
      }

      (client as any).userId = userId;

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      client.join(`user:${userId}`);
      this.logger.log(`Client connected: ${client.id} (user: ${userId})`);
    } catch {
      this.logger.warn(`Connection rejected: token verification failed (${client.id})`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client as any).userId as string;
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId)!.delete(client.id);
      if (this.userSockets.get(userId)!.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Send a notification to a specific user via WebSocket
   */
  sendToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification.new', notification);
  }

  /**
   * Send updated unread count to a user
   */
  sendUnreadCount(userId: string, count: number) {
    this.server.to(`user:${userId}`).emit('notification.count', { count });
  }
}
