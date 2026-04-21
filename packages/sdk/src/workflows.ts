import type { FriendsResource } from './resources/friends.js';
import type { ScenariosResource } from './resources/scenarios.js';
import type { BroadcastsResource } from './resources/broadcasts.js';
import type {
  StepDefinition,
  ScenarioTriggerType,
  ScenarioWithSteps,
  Broadcast,
  MessageType,
  SegmentCondition,
} from './types.js';
import { parseDelay } from './delay.js';

export type Workflows = Readonly<{
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
}>;

export function createWorkflows(
  deps: Readonly<{
    friends: FriendsResource;
    scenarios: ScenariosResource;
    broadcasts: BroadcastsResource;
  }>,
): Workflows {
  const { friends, scenarios, broadcasts } = deps;

  return {
    async createStepScenario(
      name: string,
      triggerType: ScenarioTriggerType,
      steps: StepDefinition[],
    ): Promise<ScenarioWithSteps> {
      const scenario = await scenarios.create({ name, triggerType });

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await scenarios.addStep(scenario.id, {
          stepOrder: i + 1,
          delayMinutes: parseDelay(step.delay),
          messageType: step.type,
          messageContent: step.content,
        });
      }

      return scenarios.get(scenario.id);
    },

    async broadcastText(text: string): Promise<Broadcast> {
      const broadcast = await broadcasts.create({
        title: text.slice(0, 50),
        messageType: 'text',
        messageContent: text,
        targetType: 'all',
      });
      return broadcasts.send(broadcast.id);
    },

    async broadcastToTag(
      tagId: string,
      messageType: MessageType,
      content: string,
    ): Promise<Broadcast> {
      const broadcast = await broadcasts.create({
        title: content.slice(0, 50),
        messageType,
        messageContent: content,
        targetType: 'tag',
        targetTagId: tagId,
      });
      return broadcasts.send(broadcast.id);
    },

    async broadcastToSegment(
      messageType: MessageType,
      content: string,
      conditions: SegmentCondition,
    ): Promise<Broadcast> {
      const broadcast = await broadcasts.create({
        title: content.slice(0, 50),
        messageType,
        messageContent: content,
        targetType: 'all',
      });
      return broadcasts.sendToSegment(broadcast.id, conditions);
    },

    async sendTextToFriend(
      friendId: string,
      text: string,
    ): Promise<Readonly<{ messageId: string }>> {
      return friends.sendMessage(friendId, text, 'text');
    },

    async sendFlexToFriend(
      friendId: string,
      flexJson: string,
    ): Promise<Readonly<{ messageId: string }>> {
      return friends.sendMessage(friendId, flexJson, 'flex');
    },
  };
}
