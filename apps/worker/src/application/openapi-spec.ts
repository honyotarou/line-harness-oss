/**
 * Public OpenAPI document (`/openapi.json`) and feature flag for `/docs`.
 */

/**
 * `/docs` and `/openapi.json` are off unless explicitly enabled (reduces production reconnaissance).
 * Set `ENABLE_PUBLIC_OPENAPI=1` for Swagger UI + spec. `DISABLE_PUBLIC_OPENAPI=1` always wins (off).
 */
export function isOpenApiDocumentationEnabled(env: {
  ENABLE_PUBLIC_OPENAPI?: string;
  DISABLE_PUBLIC_OPENAPI?: string;
}): boolean {
  const disable = env.DISABLE_PUBLIC_OPENAPI?.trim().toLowerCase();
  if (disable === '1' || disable === 'true' || disable === 'yes' || disable === 'on') {
    return false;
  }
  const enable = env.ENABLE_PUBLIC_OPENAPI?.trim().toLowerCase();
  return enable === '1' || enable === 'true' || enable === 'yes' || enable === 'on';
}

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'LINE OSS CRM API',
    version: '0.2.0',
    description:
      'Open-source LINE Official Account CRM/marketing automation API. API-first design for Claude Code / AI agent integration.',
    license: { name: 'MIT' },
  },
  servers: [{ url: '/', description: 'Current server' }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'API Key passed as Bearer token',
      },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {},
          error: { type: 'string' },
        },
      },
      Friend: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          lineUserId: { type: 'string' },
          displayName: { type: 'string', nullable: true },
          pictureUrl: { type: 'string', nullable: true },
          statusMessage: { type: 'string', nullable: true },
          isFollowing: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' } },
        },
      },
      Tag: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          color: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Scenario: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          triggerType: { type: 'string', enum: ['friend_add', 'tag_added', 'manual'] },
          triggerTagId: { type: 'string', nullable: true },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ScenarioStep: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          scenarioId: { type: 'string' },
          stepOrder: { type: 'integer' },
          delayMinutes: { type: 'integer' },
          messageType: { type: 'string', enum: ['text', 'image', 'flex'] },
          messageContent: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Broadcast: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          messageType: { type: 'string', enum: ['text', 'image', 'flex'] },
          messageContent: { type: 'string' },
          targetType: { type: 'string', enum: ['all', 'tag'] },
          targetTagId: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['draft', 'scheduled', 'sending', 'sent'] },
          scheduledAt: { type: 'string', nullable: true },
          sentAt: { type: 'string', nullable: true },
          totalCount: { type: 'integer' },
          successCount: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', nullable: true },
          phone: { type: 'string', nullable: true },
          externalId: { type: 'string', nullable: true },
          displayName: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      LineAccount: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          channelId: { type: 'string' },
          name: { type: 'string' },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      TrafficPool: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          slug: { type: 'string' },
          name: { type: 'string' },
          activeAccountId: { type: 'string' },
          accountName: { type: 'string' },
          liffId: { type: 'string', nullable: true },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string' },
          updatedAt: { type: 'string' },
        },
      },
      PoolAccountRow: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          poolId: { type: 'string' },
          lineAccountId: { type: 'string' },
          accountName: { type: 'string' },
          liffId: { type: 'string', nullable: true },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string' },
        },
      },
      ConversionPoint: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          eventType: { type: 'string' },
          value: { type: 'number', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ConversionEvent: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          conversionPointId: { type: 'string' },
          friendId: { type: 'string' },
          userId: { type: 'string', nullable: true },
          affiliateCode: { type: 'string', nullable: true },
          metadata: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Affiliate: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          code: { type: 'string' },
          commissionRate: { type: 'number' },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AffiliateReport: {
        type: 'object',
        properties: {
          affiliateId: { type: 'string' },
          affiliateName: { type: 'string' },
          code: { type: 'string' },
          commissionRate: { type: 'number' },
          totalClicks: { type: 'integer' },
          totalConversions: { type: 'integer' },
          totalRevenue: { type: 'number' },
        },
      },
      InboxThread: {
        type: 'object',
        properties: {
          friendId: { type: 'string' },
          friendName: { type: 'string' },
          friendPictureUrl: { type: 'string', nullable: true },
          lineUserId: { type: 'string', nullable: true },
          lineAccountId: { type: 'string', nullable: true },
          lastContent: { type: 'string', nullable: true },
          lastDirection: { type: 'string', nullable: true },
          lastAt: { type: 'string', nullable: true },
          incomingTotal: { type: 'integer' },
        },
      },
      MediaImageUpload: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          mimeType: { type: 'string' },
          byteSize: { type: 'integer' },
          publicUrlPath: {
            type: 'string',
            description: 'Path under this Worker; prefix with WORKER_URL for LINE',
          },
        },
      },
      AdPlatformConnection: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          provider: { type: 'string', enum: ['meta', 'google', 'tiktok', 'x'] },
          name: { type: 'string' },
          lineAccountId: { type: 'string', nullable: true },
          externalAccountRef: { type: 'string', nullable: true },
          hasCredentials: { type: 'boolean' },
          metadata: {},
          isActive: { type: 'boolean' },
          createdAt: { type: 'string' },
          updatedAt: { type: 'string' },
        },
      },
    },
  },
  paths: {
    // ── Friends ─────────────────────────────────────────────────────────────
    '/api/friends': {
      get: {
        tags: ['Friends'],
        summary: '友だち一覧取得',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          { name: 'tagId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Paginated friends list' } },
      },
    },
    '/api/friends/count': {
      get: {
        tags: ['Friends'],
        summary: '友だち数取得',
        responses: { '200': { description: 'Count' } },
      },
    },
    '/api/friends/{id}': {
      get: {
        tags: ['Friends'],
        summary: '友だち詳細取得',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Friend with tags' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/friends/{id}/tags': {
      post: {
        tags: ['Friends'],
        summary: '友だちにタグ追加',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { tagId: { type: 'string' } },
                required: ['tagId'],
              },
            },
          },
        },
        responses: { '201': { description: 'Tag added' } },
      },
    },
    '/api/friends/{id}/tags/{tagId}': {
      delete: {
        tags: ['Friends'],
        summary: '友だちからタグ削除',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'tagId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Tag removed' } },
      },
    },
    // ── Tags ────────────────────────────────────────────────────────────────
    '/api/tags': {
      get: {
        tags: ['Tags'],
        summary: 'タグ一覧取得',
        responses: { '200': { description: 'All tags' } },
      },
      post: {
        tags: ['Tags'],
        summary: 'タグ作成',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { name: { type: 'string' }, color: { type: 'string' } },
                required: ['name'],
              },
            },
          },
        },
        responses: { '201': { description: 'Tag created' } },
      },
    },
    '/api/tags/{id}': {
      delete: {
        tags: ['Tags'],
        summary: 'タグ削除',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Tag deleted' } },
      },
    },
    // ── Scenarios ────────────────────────────────────────────────────────────
    '/api/scenarios': {
      get: {
        tags: ['Scenarios'],
        summary: 'シナリオ一覧取得',
        responses: { '200': { description: 'All scenarios' } },
      },
      post: {
        tags: ['Scenarios'],
        summary: 'シナリオ作成',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  triggerType: { type: 'string' },
                  description: { type: 'string' },
                  triggerTagId: { type: 'string' },
                  isActive: { type: 'boolean' },
                },
                required: ['name', 'triggerType'],
              },
            },
          },
        },
        responses: { '201': { description: 'Scenario created' } },
      },
    },
    '/api/scenarios/{id}': {
      get: {
        tags: ['Scenarios'],
        summary: 'シナリオ詳細取得 (ステップ含む)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Scenario with steps' } },
      },
      put: {
        tags: ['Scenarios'],
        summary: 'シナリオ更新',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated' } },
      },
      delete: {
        tags: ['Scenarios'],
        summary: 'シナリオ削除',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Deleted' } },
      },
    },
    '/api/scenarios/{id}/steps': {
      post: {
        tags: ['Scenarios'],
        summary: 'ステップ追加',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '201': { description: 'Step created' } },
      },
    },
    '/api/scenarios/{id}/steps/{stepId}': {
      put: {
        tags: ['Scenarios'],
        summary: 'ステップ更新',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'stepId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Updated' } },
      },
      delete: {
        tags: ['Scenarios'],
        summary: 'ステップ削除',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'stepId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Deleted' } },
      },
    },
    '/api/scenarios/{id}/enroll/{friendId}': {
      post: {
        tags: ['Scenarios'],
        summary: '手動エンロール',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'friendId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '201': { description: 'Enrolled' } },
      },
    },
    // ── Broadcasts ───────────────────────────────────────────────────────────
    '/api/broadcasts': {
      get: {
        tags: ['Broadcasts'],
        summary: '配信一覧取得',
        responses: { '200': { description: 'All broadcasts' } },
      },
      post: {
        tags: ['Broadcasts'],
        summary: '配信作成',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  messageType: { type: 'string' },
                  messageContent: { type: 'string' },
                  targetType: { type: 'string' },
                  targetTagId: { type: 'string' },
                  scheduledAt: { type: 'string' },
                },
                required: ['title', 'messageType', 'messageContent', 'targetType'],
              },
            },
          },
        },
        responses: { '201': { description: 'Broadcast created' } },
      },
    },
    '/api/broadcasts/{id}': {
      get: {
        tags: ['Broadcasts'],
        summary: '配信詳細取得',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Broadcast' } },
      },
      put: {
        tags: ['Broadcasts'],
        summary: '配信更新',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated' } },
      },
      delete: {
        tags: ['Broadcasts'],
        summary: '配信削除',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Deleted' } },
      },
    },
    '/api/broadcasts/{id}/send': {
      post: {
        tags: ['Broadcasts'],
        summary: '即時配信',
        description:
          'When `BROADCAST_SEND_SECRET` is set (or required on HTTPS), send header `X-Broadcast-Send-Secret` matching the env value.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Sent' },
          '429': { description: 'Too many requests (per-admin mass-send rate limit)' },
        },
      },
    },
    '/api/broadcasts/{id}/segment-preview-count': {
      post: {
        tags: ['Broadcasts'],
        summary: 'セグメント対象人数プレビュー（送信しない）',
        description:
          'D1-backed rate limit. Body: `{ conditions }` (same shape as segment send rules).',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  conditions: {
                    type: 'object',
                    description: 'SegmentCondition (operator + rules)',
                  },
                },
                required: ['conditions'],
              },
            },
          },
        },
        responses: {
          '200': { description: '{ count: number }' },
          '429': { description: 'Too many requests' },
        },
      },
    },
    '/api/broadcasts/{id}/test-push': {
      post: {
        tags: ['Broadcasts'],
        summary: '1 件テスト送信（指定 friendId）',
        description:
          'Same `X-Broadcast-Send-Secret` policy as mass send when configured. Body must include `confirm: true`.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  friendId: { type: 'string' },
                  confirm: { const: true, description: 'Must be true' },
                },
                required: ['friendId', 'confirm'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Push accepted' },
          '400': { description: 'Friend cannot receive or confirm missing' },
          '429': { description: 'Too many requests' },
        },
      },
    },
    // ── Inbox ─────────────────────────────────────────────────────────────────
    '/api/inbox/threads': {
      get: {
        tags: ['Inbox'],
        summary: '受信箱スレッド一覧',
        description:
          'Friends with at least one `messages_log` row, newest activity first. Restricted principals require `lineAccountId` query.',
        parameters: [
          { name: 'lineAccountId', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          '200': { description: 'Array of InboxThread' },
          '400': { description: 'lineAccountId required' },
        },
      },
    },
    // ── Media (R2) ───────────────────────────────────────────────────────────
    '/api/images': {
      post: {
        tags: ['Media'],
        summary: '画像アップロード（管理 API）',
        description:
          'Requires R2 binding `LINE_CRM_IMAGES`; returns 503 when unconfigured. Payload size and type checks apply.',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  mimeType: { type: 'string' },
                  base64: { type: 'string' },
                  lineAccountId: { type: 'string', nullable: true },
                },
                required: ['mimeType', 'base64'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'MediaImageUpload' },
          '400': { description: 'Invalid payload or image policy violation' },
          '503': { description: 'R2 not bound' },
        },
      },
    },
    '/api/images/public/{token}': {
      get: {
        tags: ['Media'],
        summary: '公開画像取得（64 hex token）',
        description:
          'No admin session; unguessable token + IP rate limit. LINE Messaging API may fetch this URL.',
        security: [],
        parameters: [
          {
            name: 'token',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
          },
        ],
        responses: {
          '200': { description: 'Image bytes (Content-Type from stored mime)' },
          '404': { description: 'Invalid token, missing object, or R2 not bound' },
          '429': { description: 'Too many requests' },
        },
      },
    },
    // ── Ad platforms ───────────────────────────────────────────────────────────
    '/api/ad-platforms': {
      get: {
        tags: ['Ad platforms'],
        summary: '広告プラットフォーム接続一覧',
        parameters: [{ name: 'lineAccountId', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: 'AdPlatformConnection[]' } },
      },
      post: {
        tags: ['Ad platforms'],
        summary: '接続作成',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  provider: { type: 'string', enum: ['meta', 'google', 'tiktok', 'x'] },
                  name: { type: 'string' },
                  lineAccountId: { type: 'string', nullable: true },
                  externalAccountRef: { type: 'string', nullable: true },
                  credentialsEnc: { type: 'string', nullable: true },
                  metadata: { type: 'object' },
                },
                required: ['provider', 'name'],
              },
            },
          },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/api/ad-platforms/{id}': {
      get: {
        tags: ['Ad platforms'],
        summary: '接続取得',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'AdPlatformConnection' },
          '404': { description: 'Not found' },
        },
      },
      put: {
        tags: ['Ad platforms'],
        summary: '接続更新',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated' } },
      },
      delete: {
        tags: ['Ad platforms'],
        summary: '接続削除',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Deleted' } },
      },
    },
    '/api/ad-platforms/{id}/sync': {
      post: {
        tags: ['Ad platforms'],
        summary: '外部同期（資格情報の検証）',
        description:
          'When `AD_PLATFORM_OUTBOUND_ENABLED` is off → 501. When on, performs a read-only HTTPS check against the vendor (Meta Graph `me`, Google userinfo, X `users/me`, TikTok advertiser info). `credentials_enc` must be JSON `{ "accessToken": "…" }` (TikTok also needs `externalAccountRef` or `advertiserId` for the advertiser id). Updates `metadata_json` with `lastOutboundSyncAt` / `lastOutboundSyncOk` / summary or error.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Serialized connection + sync summary' },
          '400': { description: 'Missing or invalid credentials JSON' },
          '404': { description: 'Not found' },
          '429': { description: 'Too many requests' },
          '501': { description: 'AD_PLATFORM_OUTBOUND_ENABLED not set' },
          '502': { description: 'Vendor rejected token or HTTP error' },
        },
      },
    },
    // ── Users (UUID Cross-Account) ──────────────────────────────────────────
    '/api/users': {
      get: {
        tags: ['Users'],
        summary: '内部ユーザー一覧取得',
        responses: { '200': { description: 'All users' } },
      },
      post: {
        tags: ['Users'],
        summary: '内部ユーザー作成',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  phone: { type: 'string' },
                  externalId: { type: 'string' },
                  displayName: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'User created' } },
      },
    },
    '/api/users/match': {
      post: {
        tags: ['Users'],
        summary: 'メール/電話でユーザー検索',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { email: { type: 'string' }, phone: { type: 'string' } },
              },
            },
          },
        },
        responses: { '200': { description: 'Matched user' }, '404': { description: 'Not found' } },
      },
    },
    '/api/users/{id}': {
      get: {
        tags: ['Users'],
        summary: 'ユーザー詳細取得',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'User' } },
      },
      put: {
        tags: ['Users'],
        summary: 'ユーザー更新',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated' } },
      },
      delete: {
        tags: ['Users'],
        summary: 'ユーザー削除',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Deleted' } },
      },
    },
    '/api/users/{id}/link': {
      post: {
        tags: ['Users'],
        summary: '友だちをUUIDにリンク',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { friendId: { type: 'string' } },
                required: ['friendId'],
              },
            },
          },
        },
        responses: { '200': { description: 'Linked' } },
      },
    },
    '/api/users/{id}/accounts': {
      get: {
        tags: ['Users'],
        summary: 'UUID紐付き友だち一覧',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Linked friends/accounts' } },
      },
    },
    // ── LINE Accounts ───────────────────────────────────────────────────────
    '/api/line-accounts': {
      get: {
        tags: ['LINE Accounts'],
        summary: 'LINEアカウント一覧',
        responses: { '200': { description: 'All LINE accounts' } },
      },
      post: {
        tags: ['LINE Accounts'],
        summary: 'LINEアカウント登録',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  channelId: { type: 'string' },
                  name: { type: 'string' },
                  channelAccessToken: { type: 'string' },
                  channelSecret: { type: 'string' },
                },
                required: ['channelId', 'name', 'channelAccessToken', 'channelSecret'],
              },
            },
          },
        },
        responses: { '201': { description: 'Account created' } },
      },
    },
    '/api/line-accounts/{id}': {
      get: {
        tags: ['LINE Accounts'],
        summary: 'LINEアカウント詳細',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Account' } },
      },
      put: {
        tags: ['LINE Accounts'],
        summary: 'LINEアカウント更新',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated' } },
      },
      delete: {
        tags: ['LINE Accounts'],
        summary: 'LINEアカウント削除',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Deleted' } },
      },
    },
    // ── Conversions ─────────────────────────────────────────────────────────
    '/api/conversions/points': {
      get: {
        tags: ['Conversions'],
        summary: 'CV ポイント一覧',
        responses: { '200': { description: 'All conversion points' } },
      },
      post: {
        tags: ['Conversions'],
        summary: 'CV ポイント作成',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  eventType: { type: 'string' },
                  value: { type: 'number' },
                },
                required: ['name', 'eventType'],
              },
            },
          },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/api/conversions/points/{id}': {
      delete: {
        tags: ['Conversions'],
        summary: 'CV ポイント削除',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Deleted' } },
      },
    },
    '/api/conversions/track': {
      post: {
        tags: ['Conversions'],
        summary: 'コンバージョン記録',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  conversionPointId: { type: 'string' },
                  friendId: { type: 'string' },
                  userId: { type: 'string' },
                  affiliateCode: { type: 'string' },
                  metadata: { type: 'object' },
                },
                required: ['conversionPointId', 'friendId'],
              },
            },
          },
        },
        responses: { '201': { description: 'Tracked' } },
      },
    },
    '/api/conversions/events': {
      get: {
        tags: ['Conversions'],
        summary: 'CV イベント一覧',
        parameters: [
          { name: 'conversionPointId', in: 'query', schema: { type: 'string' } },
          { name: 'friendId', in: 'query', schema: { type: 'string' } },
          { name: 'affiliateCode', in: 'query', schema: { type: 'string' } },
          { name: 'startDate', in: 'query', schema: { type: 'string' } },
          { name: 'endDate', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Events' } },
      },
    },
    '/api/conversions/report': {
      get: {
        tags: ['Conversions'],
        summary: 'CV レポート',
        parameters: [
          { name: 'startDate', in: 'query', schema: { type: 'string' } },
          { name: 'endDate', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Aggregated report' } },
      },
    },
    // ── Affiliates ──────────────────────────────────────────────────────────
    '/api/affiliates': {
      get: {
        tags: ['Affiliates'],
        summary: 'アフィリエイト一覧',
        responses: { '200': { description: 'All affiliates' } },
      },
      post: {
        tags: ['Affiliates'],
        summary: 'アフィリエイト作成',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  code: { type: 'string' },
                  commissionRate: { type: 'number' },
                },
                required: ['name', 'code'],
              },
            },
          },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/api/affiliates/{id}': {
      get: {
        tags: ['Affiliates'],
        summary: 'アフィリエイト詳細',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Affiliate' } },
      },
      put: {
        tags: ['Affiliates'],
        summary: 'アフィリエイト更新',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated' } },
      },
      delete: {
        tags: ['Affiliates'],
        summary: 'アフィリエイト削除',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Deleted' } },
      },
    },
    '/api/affiliates/{id}/report': {
      get: {
        tags: ['Affiliates'],
        summary: 'アフィリエイトレポート',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'startDate', in: 'query', schema: { type: 'string' } },
          { name: 'endDate', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Report' } },
      },
    },
    '/api/affiliates/click': {
      post: {
        tags: ['Affiliates'],
        summary: 'クリック記録',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { code: { type: 'string' }, url: { type: 'string' } },
                required: ['code'],
              },
            },
          },
        },
        responses: { '201': { description: 'Recorded' } },
      },
    },
    // ── Auto replies ─────────────────────────────────────────────────────────
    '/api/auto-replies': {
      get: {
        tags: ['Auto replies'],
        summary: '自動返信ルール一覧',
        parameters: [{ name: 'accountId', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: 'Rules' } },
      },
      post: {
        tags: ['Auto replies'],
        summary: '自動返信ルール作成',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  keyword: { type: 'string' },
                  matchType: { type: 'string', enum: ['exact', 'contains'] },
                  responseType: { type: 'string' },
                  responseContent: { type: 'string' },
                  lineAccountId: { type: 'string', nullable: true },
                },
                required: ['keyword', 'responseContent'],
              },
            },
          },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/api/auto-replies/{id}': {
      get: {
        tags: ['Auto replies'],
        summary: '自動返信ルール取得',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Rule' }, '404': { description: 'Not found' } },
      },
      put: {
        tags: ['Auto replies'],
        summary: '自動返信ルール更新',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated' }, '404': { description: 'Not found' } },
      },
      delete: {
        tags: ['Auto replies'],
        summary: '自動返信ルール削除',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Deleted' }, '404': { description: 'Not found' } },
      },
    },
    // ── Traffic pools (public entry + admin API) ─────────────────────────────
    '/pool/{slug}': {
      get: {
        tags: ['Traffic pools'],
        summary: 'トラフィックプール入口（LIFF OAuth へ 302）',
        security: [],
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '302': { description: 'Redirect to /auth/line?pool=…' },
          '404': { description: 'Pool not found' },
        },
      },
    },
    '/api/traffic-pools': {
      get: {
        tags: ['Traffic pools'],
        summary: 'トラフィックプール一覧',
        responses: { '200': { description: 'Pools' } },
      },
      post: {
        tags: ['Traffic pools'],
        summary: 'トラフィックプール作成',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  slug: { type: 'string' },
                  name: { type: 'string' },
                  activeAccountId: { type: 'string' },
                },
                required: ['slug', 'name', 'activeAccountId'],
              },
            },
          },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/api/traffic-pools/{id}': {
      put: {
        tags: ['Traffic pools'],
        summary: 'トラフィックプール更新',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated' } },
      },
      delete: {
        tags: ['Traffic pools'],
        summary: 'トラフィックプール削除',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Deleted' } },
      },
    },
    '/api/traffic-pools/{id}/accounts': {
      get: {
        tags: ['Traffic pools'],
        summary: 'プール内 LINE アカウント一覧',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Pool accounts' } },
      },
      post: {
        tags: ['Traffic pools'],
        summary: 'プールに LINE アカウント追加',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { lineAccountId: { type: 'string' } },
                required: ['lineAccountId'],
              },
            },
          },
        },
        responses: { '201': { description: 'Added' } },
      },
    },
    '/api/traffic-pools/{id}/accounts/{accountId}': {
      put: {
        tags: ['Traffic pools'],
        summary: 'プールアカウントの有効/無効',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'accountId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { isActive: { type: 'boolean' } },
                required: ['isActive'],
              },
            },
          },
        },
        responses: { '200': { description: 'Updated' } },
      },
      delete: {
        tags: ['Traffic pools'],
        summary: 'プールから LINE アカウント削除',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'accountId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Removed' } },
      },
    },
    // ── Webhook ─────────────────────────────────────────────────────────────
    '/webhook': {
      post: {
        tags: ['Webhook'],
        summary: 'LINE Messaging API Webhook',
        description:
          'LINE プラットフォームからのWebhookイベントを受信。署名検証あり、常に200を返す。',
        security: [],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  tags: [
    { name: 'Friends', description: '友だち管理' },
    { name: 'Tags', description: 'タグ管理' },
    { name: 'Scenarios', description: 'ステップ配信シナリオ' },
    { name: 'Broadcasts', description: '一斉配信' },
    { name: 'Users', description: 'UUID Cross-Account ユーザー管理' },
    { name: 'LINE Accounts', description: 'マルチLINEアカウント管理' },
    { name: 'Conversions', description: 'コンバージョン計測' },
    { name: 'Affiliates', description: 'アフィリエイト管理' },
    { name: 'Auto replies', description: 'キーワード自動返信（Webhook が D1 のルールを評価）' },
    { name: 'Traffic pools', description: 'トラフィックプール（/pool/:slug エントリと管理 API）' },
    { name: 'Inbox', description: '受信箱（messages_log ベースのスレッド一覧）' },
    { name: 'Media', description: 'R2 画像（管理アップロードと公開取得）' },
    { name: 'Ad platforms', description: '広告プラットフォーム接続レジストリ' },
    { name: 'Webhook', description: 'LINE Webhook' },
  ],
};
