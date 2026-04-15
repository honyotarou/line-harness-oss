import { HttpClient } from './http.js';
import { FriendsResource } from './resources/friends.js';
import { TagsResource } from './resources/tags.js';
import { ScenariosResource } from './resources/scenarios.js';
import { BroadcastsResource } from './resources/broadcasts.js';
import { RichMenusResource } from './resources/rich-menus.js';
import { TrackedLinksResource } from './resources/tracked-links.js';
import { FormsResource } from './resources/forms.js';
import { createWorkflows, type WorkflowsApi } from './workflows.js';
import type {
  LineHarnessConfig,
  StepDefinition,
  ScenarioTriggerType,
  ScenarioWithSteps,
  Broadcast,
  MessageType,
  SegmentCondition,
} from './types.js';

export type LineHarnessApi = {
  readonly friends: FriendsResource;
  readonly tags: TagsResource;
  readonly scenarios: ScenariosResource;
  readonly broadcasts: BroadcastsResource;
  readonly richMenus: RichMenusResource;
  readonly trackedLinks: TrackedLinksResource;
  readonly forms: FormsResource;

  readonly createStepScenario: (
    name: string,
    triggerType: ScenarioTriggerType,
    steps: StepDefinition[],
  ) => Promise<ScenarioWithSteps>;
  readonly broadcastText: (text: string) => Promise<Broadcast>;
  readonly broadcastToTag: (
    tagId: string,
    messageType: MessageType,
    content: string,
  ) => Promise<Broadcast>;
  readonly broadcastToSegment: (
    messageType: MessageType,
    content: string,
    conditions: SegmentCondition,
  ) => Promise<Broadcast>;
  readonly sendTextToFriend: (friendId: string, text: string) => Promise<{ messageId: string }>;
  readonly sendFlexToFriend: (friendId: string, flexJson: string) => Promise<{ messageId: string }>;

  readonly getAuthUrl: (options?: { ref?: string; redirect?: string }) => string;
};

export function createLineHarness(config: LineHarnessConfig): LineHarnessApi {
  const apiUrl = config.apiUrl.replace(/\/$/, '');
  const defaultAccountId = config.lineAccountId;

  const http = new HttpClient({
    baseUrl: apiUrl,
    apiKey: config.apiKey,
    timeout: config.timeout ?? 30_000,
  });

  const friends = new FriendsResource(http, defaultAccountId);
  const tags = new TagsResource(http);
  const scenarios = new ScenariosResource(http, defaultAccountId);
  const broadcasts = new BroadcastsResource(http, defaultAccountId);
  const richMenus = new RichMenusResource(http);
  const trackedLinks = new TrackedLinksResource(http);
  const forms = new FormsResource(http);
  const workflows = createWorkflows({
    friends,
    scenarios,
    broadcasts,
  });

  return {
    friends,
    tags,
    scenarios,
    broadcasts,
    richMenus,
    trackedLinks,
    forms,

    createStepScenario: workflows.createStepScenario,
    broadcastText: workflows.broadcastText,
    broadcastToTag: workflows.broadcastToTag,
    broadcastToSegment: workflows.broadcastToSegment,
    sendTextToFriend: workflows.sendTextToFriend,
    sendFlexToFriend: workflows.sendFlexToFriend,

    getAuthUrl(options?: { ref?: string; redirect?: string }): string {
      const url = new URL(`${apiUrl}/auth/line`);
      if (options?.ref) url.searchParams.set('ref', options.ref);
      if (options?.redirect) url.searchParams.set('redirect', options.redirect);
      return url.toString();
    },
  };
}

export class LineHarness {
  readonly friends: FriendsResource;
  readonly tags: TagsResource;
  readonly scenarios: ScenariosResource;
  readonly broadcasts: BroadcastsResource;
  readonly richMenus: RichMenusResource;
  readonly trackedLinks: TrackedLinksResource;
  readonly forms: FormsResource;

  private readonly apiUrl: string;
  private readonly defaultAccountId: string | undefined;
  private readonly workflows: WorkflowsApi;

  readonly createStepScenario: (
    name: string,
    triggerType: ScenarioTriggerType,
    steps: StepDefinition[],
  ) => Promise<ScenarioWithSteps>;
  readonly broadcastText: (text: string) => Promise<Broadcast>;
  readonly broadcastToTag: (
    tagId: string,
    messageType: MessageType,
    content: string,
  ) => Promise<Broadcast>;
  readonly broadcastToSegment: (
    messageType: MessageType,
    content: string,
    conditions: SegmentCondition,
  ) => Promise<Broadcast>;
  readonly sendTextToFriend: (friendId: string, text: string) => Promise<{ messageId: string }>;
  readonly sendFlexToFriend: (friendId: string, flexJson: string) => Promise<{ messageId: string }>;

  constructor(config: LineHarnessConfig) {
    const api = createLineHarness(config);
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.defaultAccountId = config.lineAccountId;

    this.friends = api.friends;
    this.tags = api.tags;
    this.scenarios = api.scenarios;
    this.broadcasts = api.broadcasts;
    this.richMenus = api.richMenus;
    this.trackedLinks = api.trackedLinks;
    this.forms = api.forms;

    this.workflows = createWorkflows({
      friends: this.friends,
      scenarios: this.scenarios,
      broadcasts: this.broadcasts,
    });

    this.createStepScenario = api.createStepScenario;
    this.broadcastText = api.broadcastText;
    this.broadcastToTag = api.broadcastToTag;
    this.broadcastToSegment = api.broadcastToSegment;
    this.sendTextToFriend = api.sendTextToFriend;
    this.sendFlexToFriend = api.sendFlexToFriend;
  }

  /**
   * Generate friend-add URL with OAuth (bot_prompt=aggressive)
   * This URL does friend-add + UUID in one step.
   *
   * @param ref - Attribution code (e.g., 'lp-a', 'instagram', 'seminar-0322')
   * @param redirect - URL to redirect after completion
   */
  getAuthUrl(options?: { ref?: string; redirect?: string }): string {
    const url = new URL(`${this.apiUrl}/auth/line`);
    if (options?.ref) url.searchParams.set('ref', options.ref);
    if (options?.redirect) url.searchParams.set('redirect', options.redirect);
    return url.toString();
  }
}
