export type Brand<Tag extends string> = { readonly __brand: Tag };
export type Branded<T, Tag extends string> = T & Brand<Tag>;

export type FriendId = Branded<string, 'FriendId'>;
export type TagId = Branded<string, 'TagId'>;
export type ScenarioId = Branded<string, 'ScenarioId'>;
export type ScenarioStepId = Branded<string, 'ScenarioStepId'>;
export type FriendScenarioId = Branded<string, 'FriendScenarioId'>;
export type BroadcastId = Branded<string, 'BroadcastId'>;
export type LineAccountId = Branded<string, 'LineAccountId'>;
export type RichMenuId = Branded<string, 'RichMenuId'>;
export type TrackedLinkId = Branded<string, 'TrackedLinkId'>;
export type TrafficPoolId = Branded<string, 'TrafficPoolId'>;
export type PoolAccountRowId = Branded<string, 'PoolAccountRowId'>;
export type FormId = Branded<string, 'FormId'>;
export type FormSubmissionId = Branded<string, 'FormSubmissionId'>;
export type CalendarConnectionId = Branded<string, 'CalendarConnectionId'>;
export type CalendarBookingId = Branded<string, 'CalendarBookingId'>;

export type LineHarnessConfig = Readonly<{
  apiUrl: string;
  apiKey: string;
  timeout?: number;
  lineAccountId?: string;
}>;

export type ApiResponse<T> = Readonly<{
  success: boolean;
  data: T;
  error?: string;
}>;

export type PaginatedData<T> = Readonly<{
  items: readonly T[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
}>;

export type ScenarioTriggerType = 'friend_add' | 'tag_added' | 'manual';
export type MessageType = 'text' | 'image' | 'flex';
export type BroadcastStatus = 'draft' | 'scheduled' | 'sending' | 'sent';

export type Friend = Readonly<{
  id: FriendId;
  lineUserId: string;
  displayName: string | null;
  pictureUrl: string | null;
  statusMessage: string | null;
  isFollowing: boolean;
  lineAccountId: LineAccountId | null;
  metadata: Readonly<Record<string, unknown>>;
  refCode: string | null;
  userId: string | null;
  tags: readonly Tag[];
  createdAt: string;
  updatedAt: string;
}>;

export type FriendListParams = Readonly<{
  limit?: number;
  offset?: number;
  tagId?: string;
  accountId?: string;
}>;

export type Tag = Readonly<{
  id: TagId;
  name: string;
  color: string;
  createdAt: string;
}>;

export type CreateTagInput = Readonly<{
  name: string;
  color?: string;
}>;

export type Scenario = Readonly<{
  id: ScenarioId;
  name: string;
  description: string | null;
  triggerType: ScenarioTriggerType;
  triggerTagId: TagId | null;
  isActive: boolean;
  lineAccountId: LineAccountId | null;
  createdAt: string;
  updatedAt: string;
}>;

export type ScenarioListItem = Scenario &
  Readonly<{
    stepCount: number;
  }>;

export type ScenarioWithSteps = Scenario &
  Readonly<{
    steps: readonly ScenarioStep[];
  }>;

export type ScenarioStep = Readonly<{
  id: ScenarioStepId;
  scenarioId: ScenarioId;
  stepOrder: number;
  delayMinutes: number;
  messageType: MessageType;
  messageContent: string;
  conditionType: string | null;
  conditionValue: string | null;
  nextStepOnFalse: number | null;
  createdAt: string;
}>;

export type CreateScenarioInput = Readonly<{
  name: string;
  description?: string;
  triggerType: ScenarioTriggerType;
  triggerTagId?: string;
  isActive?: boolean;
}>;

export type CreateStepInput = Readonly<{
  stepOrder: number;
  delayMinutes: number;
  messageType: MessageType;
  messageContent: string;
  conditionType?: string | null;
  conditionValue?: string | null;
  nextStepOnFalse?: number | null;
}>;

export type UpdateScenarioInput = Readonly<{
  name?: string;
  description?: string | null;
  triggerType?: ScenarioTriggerType;
  triggerTagId?: string | null;
  isActive?: boolean;
}>;

export type UpdateStepInput = Readonly<{
  stepOrder?: number;
  delayMinutes?: number;
  messageType?: MessageType;
  messageContent?: string;
  conditionType?: string | null;
  conditionValue?: string | null;
  nextStepOnFalse?: number | null;
}>;

export type FriendScenarioEnrollment = Readonly<{
  id: FriendScenarioId;
  friendId: FriendId;
  scenarioId: ScenarioId;
  currentStepOrder: number;
  status: 'active' | 'paused' | 'completed';
  startedAt: string;
  nextDeliveryAt: string | null;
  updatedAt: string;
}>;

export type Broadcast = Readonly<{
  id: BroadcastId;
  title: string;
  messageType: MessageType;
  messageContent: string;
  targetType: 'all' | 'tag';
  targetTagId: TagId | null;
  status: BroadcastStatus;
  lineAccountId: LineAccountId | null;
  scheduledAt: string | null;
  sentAt: string | null;
  totalCount: number;
  successCount: number;
  createdAt: string;
}>;

export type CreateBroadcastInput = Readonly<{
  title: string;
  messageType: MessageType;
  messageContent: string;
  targetType: 'all' | 'tag';
  targetTagId?: string;
  scheduledAt?: string;
}>;

export type UpdateBroadcastInput = Readonly<{
  title?: string;
  messageType?: MessageType;
  messageContent?: string;
  targetType?: 'all' | 'tag';
  targetTagId?: string | null;
  scheduledAt?: string | null;
}>;

export type RichMenuBounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type RichMenuAction =
  | Readonly<{ type: 'postback'; data: string; displayText?: string; label?: string }>
  | Readonly<{ type: 'message'; text: string; label?: string }>
  | Readonly<{ type: 'uri'; uri: string; label?: string }>
  | Readonly<{
      type: 'datetimepicker';
      data: string;
      mode: 'date' | 'time' | 'datetime';
      label?: string;
    }>
  | Readonly<{ type: 'richmenuswitch'; richMenuAliasId: string; data: string; label?: string }>;

export type RichMenuArea = Readonly<{
  bounds: RichMenuBounds;
  action: RichMenuAction;
}>;

export type RichMenu = Readonly<{
  richMenuId: RichMenuId;
  size: Readonly<{ width: number; height: number }>;
  selected: boolean;
  name: string;
  chatBarText: string;
  areas: readonly RichMenuArea[];
}>;

export type CreateRichMenuInput = Readonly<{
  size: Readonly<{ width: number; height: number }>;
  selected: boolean;
  name: string;
  chatBarText: string;
  areas: readonly RichMenuArea[];
}>;

export type SegmentRule = Readonly<{
  type:
    | 'tag_exists'
    | 'tag_not_exists'
    | 'metadata_equals'
    | 'metadata_not_equals'
    | 'ref_code'
    | 'is_following';
  value: string | boolean | Readonly<{ key: string; value: string }>;
}>;

export type SegmentCondition = Readonly<{
  operator: 'AND' | 'OR';
  rules: readonly SegmentRule[];
}>;

export type TrackedLink = Readonly<{
  id: TrackedLinkId;
  name: string;
  originalUrl: string;
  trackingUrl: string;
  tagId: TagId | null;
  scenarioId: ScenarioId | null;
  isActive: boolean;
  clickCount: number;
  createdAt: string;
  updatedAt: string;
}>;

export type LinkClick = Readonly<{
  id: string;
  friendId: FriendId | null;
  friendDisplayName: string | null;
  clickedAt: string;
}>;

export type TrackedLinkWithClicks = TrackedLink &
  Readonly<{
    clicks: readonly LinkClick[];
  }>;

export type CreateTrackedLinkInput = Readonly<{
  name: string;
  originalUrl: string;
  tagId?: string | null;
  scenarioId?: string | null;
}>;

export type TrafficPool = Readonly<{
  id: TrafficPoolId;
  slug: string;
  name: string;
  activeAccountId: LineAccountId;
  accountName: string;
  liffId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export type PoolAccountRow = Readonly<{
  id: PoolAccountRowId;
  poolId: TrafficPoolId;
  lineAccountId: LineAccountId;
  accountName: string;
  liffId: string | null;
  isActive: boolean;
  createdAt: string;
}>;

export type CreateTrafficPoolInput = Readonly<{
  slug: string;
  name: string;
  activeAccountId: string;
}>;

export type UpdateTrafficPoolInput = Readonly<{
  name?: string;
  activeAccountId?: string;
  isActive?: boolean;
}>;

export type FormField = Readonly<{
  name: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date';
  required?: boolean;
  options?: readonly string[];
  placeholder?: string;
}>;

export type Form = Readonly<{
  id: FormId;
  name: string;
  description: string | null;
  fields: readonly FormField[];
  onSubmitTagId: TagId | null;
  onSubmitScenarioId: ScenarioId | null;
  saveToMetadata: boolean;
  isActive: boolean;
  submitCount: number;
  createdAt: string;
  updatedAt: string;
}>;

export type CreateFormInput = Readonly<{
  name: string;
  description?: string;
  fields: readonly FormField[];
  onSubmitTagId?: string | null;
  onSubmitScenarioId?: string | null;
  saveToMetadata?: boolean;
}>;

export type UpdateFormInput = Readonly<{
  name?: string;
  description?: string | null;
  fields?: readonly FormField[];
  onSubmitTagId?: string | null;
  onSubmitScenarioId?: string | null;
  saveToMetadata?: boolean;
  isActive?: boolean;
}>;

export type FormSubmission = Readonly<{
  id: FormSubmissionId;
  formId: FormId;
  friendId: FriendId | null;
  data: Readonly<Record<string, unknown>>;
  createdAt: string;
}>;

export type CalendarConnection = Readonly<{
  id: CalendarConnectionId;
  calendarId: string;
  authType: string;
  isActive: boolean;
  createdAt: string;
}>;

export type CalendarSlot = Readonly<{
  startAt: string;
  endAt: string;
  available: boolean;
}>;

export type CalendarBooking = Readonly<{
  id: CalendarBookingId;
  connectionId: CalendarConnectionId;
  friendId: FriendId | null;
  eventId: string | null;
  title: string;
  startAt: string;
  endAt: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  createdAt: string;
}>;

export type StepDefinition = Readonly<{
  delay: string;
  type: MessageType;
  content: string;
}>;
