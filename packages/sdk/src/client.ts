import { createHttpClient } from './http.js';
import { createFriendsResource, type FriendsResource } from './resources/friends.js';
import { createTagsResource, type TagsResource } from './resources/tags.js';
import { createScenariosResource, type ScenariosResource } from './resources/scenarios.js';
import { createBroadcastsResource, type BroadcastsResource } from './resources/broadcasts.js';
import { createRichMenusResource, type RichMenusResource } from './resources/rich-menus.js';
import {
  createTrackedLinksResource,
  type TrackedLinksResource,
} from './resources/tracked-links.js';
import {
  createTrafficPoolsResource,
  type TrafficPoolsResource,
} from './resources/traffic-pools.js';
import { createFormsResource, type FormsResource } from './resources/forms.js';
import { createWorkflows } from './workflows.js';
import type { Workflows } from './workflows.js';
import type {
  LineHarnessConfig,
  StepDefinition,
  ScenarioTriggerType,
  ScenarioWithSteps,
  Broadcast,
  MessageType,
  SegmentCondition,
} from './types.js';

export type LineHarness = Readonly<{
  friends: FriendsResource;
  tags: TagsResource;
  scenarios: ScenariosResource;
  broadcasts: BroadcastsResource;
  richMenus: RichMenusResource;
  trackedLinks: TrackedLinksResource;
  trafficPools: TrafficPoolsResource;
  forms: FormsResource;
  createStepScenario: (
    name: string,
    triggerType: ScenarioTriggerType,
    steps: StepDefinition[],
  ) => Promise<ScenarioWithSteps>;
  broadcastText: (text: string) => Promise<Broadcast>;
  broadcastToTag: (tagId: string, messageType: MessageType, content: string) => Promise<Broadcast>;
  broadcastToSegment: (
    messageType: MessageType,
    content: string,
    conditions: SegmentCondition,
  ) => Promise<Broadcast>;
  sendTextToFriend: (friendId: string, text: string) => Promise<Readonly<{ messageId: string }>>;
  sendFlexToFriend: (
    friendId: string,
    flexJson: string,
  ) => Promise<Readonly<{ messageId: string }>>;
  getAuthUrl: (options?: Readonly<{ ref?: string; redirect?: string }>) => string;
}>;

export function createLineHarness(config: LineHarnessConfig): LineHarness {
  const apiUrl = config.apiUrl.replace(/\/$/, '');
  const defaultAccountId = config.lineAccountId;

  const http = createHttpClient({
    baseUrl: apiUrl,
    apiKey: config.apiKey,
    timeout: config.timeout ?? 30_000,
  });

  const friends = createFriendsResource(http, defaultAccountId);
  const tags = createTagsResource(http);
  const scenarios = createScenariosResource(http, defaultAccountId);
  const broadcasts = createBroadcastsResource(http, defaultAccountId);
  const richMenus = createRichMenusResource(http);
  const trackedLinks = createTrackedLinksResource(http);
  const trafficPools = createTrafficPoolsResource(http);
  const forms = createFormsResource(http);
  const workflows: Workflows = createWorkflows({
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
    trafficPools,
    forms,
    createStepScenario: workflows.createStepScenario,
    broadcastText: workflows.broadcastText,
    broadcastToTag: workflows.broadcastToTag,
    broadcastToSegment: workflows.broadcastToSegment,
    sendTextToFriend: workflows.sendTextToFriend,
    sendFlexToFriend: workflows.sendFlexToFriend,
    getAuthUrl(options?: Readonly<{ ref?: string; redirect?: string }>): string {
      const url = new URL(`${apiUrl}/auth/line`);
      if (options?.ref) url.searchParams.set('ref', options.ref);
      if (options?.redirect) url.searchParams.set('redirect', options.redirect);
      return url.toString();
    },
  };
}
