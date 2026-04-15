/** Fallback footer in the LINE Flex after LIFF form submit. Override with Worker var `FORM_SUBMIT_FLEX_FOOTER`. */
export const DEFAULT_FORM_SUBMIT_FLEX_FOOTER =
  'この内容はアカウントに記録され、タグやシナリオ等に利用される場合があります。チャットでの即時返信はできない場合があります。';

export function resolveFormSubmitFlexFooterText(env: { FORM_SUBMIT_FLEX_FOOTER?: string }): string {
  const custom = env.FORM_SUBMIT_FLEX_FOOTER?.trim();
  return custom && custom.length > 0 ? custom : DEFAULT_FORM_SUBMIT_FLEX_FOOTER;
}
