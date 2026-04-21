// ─── Source types ────────────────────────────────────────────────────────────

export type UserSource = Readonly<{
  type: 'user';
  userId: string;
}>;

export type GroupSource = Readonly<{
  type: 'group';
  groupId: string;
  userId?: string;
}>;

export type RoomSource = Readonly<{
  type: 'room';
  roomId: string;
  userId?: string;
}>;

export type Source = UserSource | GroupSource | RoomSource;

// ─── Message subtypes ────────────────────────────────────────────────────────

export type TextEventMessage = Readonly<{
  type: 'text';
  id: string;
  text: string;
}>;

export type ImageEventMessage = Readonly<{
  type: 'image';
  id: string;
  contentProvider: {
    type: 'line' | 'external';
    originalContentUrl?: string;
    previewImageUrl?: string;
  };
}>;

export type VideoEventMessage = Readonly<{
  type: 'video';
  id: string;
  duration: number;
  contentProvider: {
    type: 'line' | 'external';
    originalContentUrl?: string;
    previewImageUrl?: string;
  };
}>;

export type AudioEventMessage = Readonly<{
  type: 'audio';
  id: string;
  duration: number;
  contentProvider: {
    type: 'line' | 'external';
    originalContentUrl?: string;
  };
}>;

export type FileEventMessage = Readonly<{
  type: 'file';
  id: string;
  fileName: string;
  fileSize: number;
}>;

export type LocationEventMessage = Readonly<{
  type: 'location';
  id: string;
  title?: string;
  address?: string;
  latitude: number;
  longitude: number;
}>;

export type StickerEventMessage = Readonly<{
  type: 'sticker';
  id: string;
  packageId: string;
  stickerId: string;
  stickerResourceType: string;
}>;

export type EventMessage =
  | TextEventMessage
  | ImageEventMessage
  | VideoEventMessage
  | AudioEventMessage
  | FileEventMessage
  | LocationEventMessage
  | StickerEventMessage;

// ─── Webhook events ───────────────────────────────────────────────────────────

type BaseEvent = Readonly<{
  timestamp: number;
  source: Source;
  webhookEventId: string;
  deliveryContext: {
    isRedelivery: boolean;
  };
  mode: 'active' | 'standby' | 'channel';
}>;

export type MessageEvent = BaseEvent &
  Readonly<{
    type: 'message';
    replyToken: string;
    message: EventMessage;
  }>;

export type FollowEvent = BaseEvent &
  Readonly<{
    type: 'follow';
    replyToken: string;
    source: UserSource | GroupSource | RoomSource;
  }>;

export type UnfollowEvent = BaseEvent &
  Readonly<{
    type: 'unfollow';
    source: UserSource | GroupSource | RoomSource;
  }>;

export type PostbackEvent = BaseEvent &
  Readonly<{
    type: 'postback';
    replyToken: string;
    postback: {
      data: string;
      params?: Record<string, string>;
    };
  }>;

export type WebhookEvent = MessageEvent | FollowEvent | UnfollowEvent | PostbackEvent;

export type WebhookRequestBody = Readonly<{
  destination: string;
  events: WebhookEvent[];
}>;

// ─── User profile ─────────────────────────────────────────────────────────────

export type UserProfile = Readonly<{
  displayName: string;
  userId: string;
  pictureUrl?: string;
  statusMessage?: string;
}>;

// ─── Send message types ───────────────────────────────────────────────────────

export type FlexContainer = object;

export type TextMessage = Readonly<{
  type: 'text';
  text: string;
}>;

export type ImageMessage = Readonly<{
  type: 'image';
  originalContentUrl: string;
  previewImageUrl: string;
}>;

export type FlexMessage = Readonly<{
  type: 'flex';
  altText: string;
  contents: FlexContainer;
}>;

export type VideoMessage = Readonly<{
  type: 'video';
  originalContentUrl: string;
  previewImageUrl: string;
}>;

export type TemplateMessage = Readonly<{
  type: 'template';
  altText: string;
  template: Record<string, unknown>;
}>;

export type ImageMapMessageType = Readonly<{
  type: 'imagemap';
  baseUrl: string;
  altText: string;
  baseSize: { width: number; height: number };
  actions: Record<string, unknown>[];
}>;

export type Message =
  | TextMessage
  | ImageMessage
  | FlexMessage
  | VideoMessage
  | TemplateMessage
  | ImageMapMessageType;

// ─── Rich Menu types ──────────────────────────────────────────────────────────

export type RichMenuSize = Readonly<{
  width: number;
  height: number;
}>;

export type RichMenuBounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type RichMenuActionPostback = Readonly<{
  type: 'postback';
  data: string;
  displayText?: string;
  label?: string;
}>;

export type RichMenuActionMessage = Readonly<{
  type: 'message';
  text: string;
  label?: string;
}>;

export type RichMenuActionUri = Readonly<{
  type: 'uri';
  uri: string;
  label?: string;
}>;

export type RichMenuActionDatetimePicker = Readonly<{
  type: 'datetimepicker';
  data: string;
  mode: 'date' | 'time' | 'datetime';
  label?: string;
}>;

export type RichMenuActionRichMenuSwitch = Readonly<{
  type: 'richmenuswitch';
  richMenuAliasId: string;
  data: string;
  label?: string;
}>;

export type RichMenuAction =
  | RichMenuActionPostback
  | RichMenuActionMessage
  | RichMenuActionUri
  | RichMenuActionDatetimePicker
  | RichMenuActionRichMenuSwitch;

export type RichMenuArea = Readonly<{
  bounds: RichMenuBounds;
  action: RichMenuAction;
}>;

export type RichMenuObject = Readonly<{
  richMenuId?: string;
  size: RichMenuSize;
  selected: boolean;
  name: string;
  chatBarText: string;
  areas: RichMenuArea[];
}>;

// ─── Request types ────────────────────────────────────────────────────────────

export type PushMessageRequest = Readonly<{
  to: string;
  messages: Message[];
}>;

export type MulticastRequest = Readonly<{
  to: string[];
  messages: Message[];
}>;

export type BroadcastRequest = Readonly<{
  messages: Message[];
}>;

export type ReplyMessageRequest = Readonly<{
  replyToken: string;
  messages: Message[];
}>;
