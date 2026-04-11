import {
  flexBubble,
  flexBox,
  flexText,
  flexButton,
  flexImage,
  flexMessage,
} from '@line-crm/line-sdk';
import type { Env } from '../index.js';
import type { Message } from '@line-crm/line-sdk';

/** Postback payload for category pick (LINE sends `data` as plain text, often `anxiety=paper`). */
export const ANXIETY_POSTBACK_PREFIX = 'anxiety=';

export type AnxietyKey = 'accident' | 'ortho' | 'iv';

const ANXIETY_KEYS = new Set<AnxietyKey>(['accident', 'ortho', 'iv']);

export type WelcomeAnxietyBindings = Pick<
  Env['Bindings'],
  | 'LIFF_URL'
  | 'WEB_URL'
  | 'WORKER_URL'
  | 'WELCOME_ANXIETY_FLOW'
  | 'LIFF_BOOKING_URL'
  | 'WELCOME_ANXIETY_HERO_URL'
  | 'WELCOME_ANXIETY_LINK_FLOW'
  | 'WELCOME_ANXIETY_LINK_PREP'
  | 'WELCOME_ANXIETY_LINK_FAQ'
  | 'WELCOME_ANXIETY_RICH_MENU_ONLY'
  | 'BOOKING_FALLBACK_TEL'
>;

/** truthy: `1`, `true`, `yes`, `on` (case-insensitive). */
export function welcomeAnxietyFlowEnabled(env: WelcomeAnxietyBindings): boolean {
  const v = env.WELCOME_ANXIETY_FLOW?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** truthy: follow-up Flex に LIFF 予約ボタンを付けず、リッチメニュー誘導のみ。 */
export function welcomeAnxietyRichMenuOnly(env: WelcomeAnxietyBindings): boolean {
  const v = env.WELCOME_ANXIETY_RICH_MENU_ONLY?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function parseAnxietyPostbackData(raw: string): AnxietyKey | null {
  const data = raw.trim();
  const decoded = (() => {
    try {
      return decodeURIComponent(data);
    } catch {
      return data;
    }
  })();
  if (!decoded.startsWith(ANXIETY_POSTBACK_PREFIX)) return null;
  const key = decoded.slice(ANXIETY_POSTBACK_PREFIX.length).trim() as AnxietyKey;
  return ANXIETY_KEYS.has(key) ? key : null;
}

function bookingLiffUri(env: WelcomeAnxietyBindings): string {
  const custom = env.LIFF_BOOKING_URL?.trim();
  if (custom && custom.length > 0) return custom;
  return env.LIFF_URL?.trim() || 'https://liff.line.me/';
}

const CATEGORY_COPY: Record<
  AnxietyKey,
  { label: string; displayText: string; title: string; body: string }
> = {
  accident: {
    label: '交通事故',
    displayText: '交通事故',
    title: '交通事故のご相談',
    body: '交通事故は手続きや状況確認が必要なため、お電話で状況を伺います。無理に予約へ進めず、まずはお困りごとを整理しましょう。',
  },
  ortho: {
    label: '整形外科',
    displayText: '整形外科',
    title: '整形外科のご予約',
    body: 'まずはメニューとご希望日時を選ぶだけで予約できます。心配事がある場合は、このトークで相談するかお電話ください。',
  },
  iv: {
    label: '自費点滴',
    displayText: '自費点滴',
    title: '自費点滴のご予約',
    body: 'メニューと空きを確認して予約できます。心配事がある場合は、このトークで相談するかお電話ください。',
  },
};

/** Welcome bubble: pick concern → postback. Optional small hero (e.g. licensed photo). */
export function buildWelcomeAnxietyFlexMessage(env: WelcomeAnxietyBindings): Message {
  const heroUrl = env.WELCOME_ANXIETY_HERO_URL?.trim();
  const intro = 'あなたのお悩みはどれですか？';

  const categoryButtons = (['accident', 'ortho', 'iv'] as const).map((key) =>
    flexButton(
      {
        type: 'postback',
        label: CATEGORY_COPY[key].label,
        data: `${ANXIETY_POSTBACK_PREFIX}${key}`,
        displayText: CATEGORY_COPY[key].displayText,
      },
      { style: 'secondary', height: 'sm' },
    ),
  );

  const bodyContents = [
    flexText('いらっしゃいませ', { size: 'sm', color: '#64748b' }),
    flexText(intro, { size: 'sm', color: '#334155', wrap: true, margin: 'md' }),
    flexText('下のいずれか1つを選んでください。', {
      size: 'xs',
      color: '#64748b',
      wrap: true,
      margin: 'md',
    }),
    flexBox('vertical', categoryButtons, { spacing: 'sm', margin: 'lg' }),
    flexText('医療の判断・診断は診察でのみ行います。', {
      size: 'xxs',
      color: '#94a3b8',
      wrap: true,
      margin: 'xl',
    }),
  ];

  const bubble = flexBubble({
    ...(heroUrl
      ? {
          hero: flexImage(heroUrl, {
            size: 'full',
            aspectRatio: '1:1',
            aspectMode: 'cover',
          }),
        }
      : {}),
    body: flexBox('vertical', bodyContents, { paddingAll: '20px' }),
  });

  return flexMessage(
    '友だち追加ありがとうございます。いちばん気になることを選んでください。',
    bubble,
  );
}

/** Second message after postback: category summary + booking + optional info links. */
export function buildAnxietyFollowupFlexMessage(
  key: AnxietyKey,
  env: WelcomeAnxietyBindings,
): Message {
  const copy = CATEGORY_COPY[key];
  const bookingUri = bookingLiffUri(env);
  const richMenuOnly = welcomeAnxietyRichMenuOnly(env);
  const telUri = (env.BOOKING_FALLBACK_TEL ?? '').trim();
  const flow = env.WELCOME_ANXIETY_LINK_FLOW?.trim();
  const prep = env.WELCOME_ANXIETY_LINK_PREP?.trim();
  const faq = env.WELCOME_ANXIETY_LINK_FAQ?.trim();

  const footerButtons = [];
  if (!richMenuOnly && key !== 'accident') {
    footerButtons.push(
      flexButton(
        { type: 'uri', label: '予約ページへ（メニューと同じ）', uri: bookingUri },
        { style: 'secondary', height: 'sm' },
      ),
    );
  }

  if (telUri) {
    footerButtons.push(
      flexButton(
        { type: 'uri', label: '心配事があるので電話する', uri: telUri },
        { style: 'link', height: 'sm' },
      ),
    );
  }

  if (flow && /^https?:\/\//i.test(flow)) {
    footerButtons.push(
      flexButton({ type: 'uri', label: '全体の流れ', uri: flow }, { style: 'link', height: 'sm' }),
    );
  }

  if (prep && /^https?:\/\//i.test(prep)) {
    footerButtons.push(
      flexButton({ type: 'uri', label: '初診の準備', uri: prep }, { style: 'link', height: 'sm' }),
    );
  }

  if (faq && /^https?:\/\//i.test(faq)) {
    footerButtons.push(
      flexButton(
        { type: 'uri', label: 'よくある不安（FAQ）', uri: faq },
        { style: 'link', height: 'sm' },
      ),
    );
  }

  const bookingHint =
    key === 'accident'
      ? '交通事故のご相談はお電話が確実です。必要な情報を一緒に整理します。'
      : richMenuOnly
        ? 'ご予約は、トーク画面下のリッチメニュー「予約」からお願いします。'
        : 'ご予約は、まずトーク画面下のリッチメニュー「予約」がわかりやすいです。下のボタンでも同じ予約ページを開けます。';

  const bubble = flexBubble({
    body: flexBox(
      'vertical',
      [
        flexText(copy.title, { weight: 'bold', size: 'lg', color: '#0f172a' }),
        flexText(copy.body, { size: 'sm', color: '#475569', wrap: true, margin: 'md' }),
        flexText(bookingHint, {
          size: 'xs',
          color: '#64748b',
          wrap: true,
          margin: 'lg',
        }),
      ],
      { paddingAll: '20px' },
    ),
    ...(footerButtons.length > 0
      ? { footer: flexBox('vertical', footerButtons, { spacing: 'sm', paddingAll: '12px' }) }
      : {}),
  });

  return flexMessage(`${copy.title}：ご案内`, bubble);
}

/** JSON string for scenario step / admin paste (flex type, same structure as buildWelcomeAnxietyFlexMessage). */
export function welcomeAnxietyFlexScenarioJson(env: WelcomeAnxietyBindings): string {
  const msg = buildWelcomeAnxietyFlexMessage(env);
  if (msg.type !== 'flex') return '{}';
  return JSON.stringify(msg.contents);
}
