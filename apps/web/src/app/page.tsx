'use client';

import { useState, useEffect } from 'react';
import '@/styles/dashboard-mock-reference.css';
import SafeLink from '@/components/safe-link';
import { api, getApiBaseUrl } from '@/lib/api';
import CcPromptButton from '@/components/cc-prompt-button';
import { useAccount } from '@/contexts/account-context';
import { Alert } from '@/components/ui/alert';

const DE = '/mock-design-elements';

const ccPrompts = [
  {
    title: 'ダッシュボードのKPI分析',
    prompt: `LINE CRM ダッシュボードのデータを分析してください。
1. 友だち数の推移を確認
2. アクティブシナリオの効果を評価
3. 配信の開封率・クリック率を分析
改善提案を含めてレポートしてください。`,
  },
  {
    title: '新しいシナリオを提案',
    prompt: `現在の友だちデータとタグ情報を元に、効果的なシナリオ配信を提案してください。
1. ターゲットセグメントの特定
2. メッセージ内容の提案
3. 配信タイミングの最適化
具体的なステップ配信の構成を含めてください。`,
  },
];

type DashboardStats = Readonly<{
  friendCount: number | null;
  activeScenarioCount: number | null;
  broadcastCount: number | null;
  templateCount: number | null;
  automationCount: number | null;
  scoringRuleCount: number | null;
}>;

function formatStat(n: number | null): string {
  if (n === null) return '—';
  return n.toLocaleString('ja-JP');
}

export default function DashboardPage() {
  const { selectedAccountId, selectedAccount } = useAccount();
  const [stats, setStats] = useState<DashboardStats>({
    friendCount: null,
    activeScenarioCount: null,
    broadcastCount: null,
    templateCount: null,
    automationCount: null,
    scoringRuleCount: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [
          friendCountRes,
          scenariosRes,
          broadcastsRes,
          templatesRes,
          automationsRes,
          scoringRes,
        ] = await Promise.allSettled([
          api.friends.count({ accountId: selectedAccountId ?? undefined }),
          api.scenarios.list({ accountId: selectedAccountId ?? undefined }),
          api.broadcasts.list({ accountId: selectedAccountId ?? undefined }),
          api.templates.list(),
          api.automations.list({ accountId: selectedAccountId ?? undefined }),
          api.scoring.rules(),
        ]);

        setStats({
          friendCount:
            friendCountRes.status === 'fulfilled' && friendCountRes.value.success
              ? friendCountRes.value.data.count
              : null,
          activeScenarioCount:
            scenariosRes.status === 'fulfilled' && scenariosRes.value.success
              ? scenariosRes.value.data.filter((s) => s.isActive).length
              : null,
          broadcastCount:
            broadcastsRes.status === 'fulfilled' && broadcastsRes.value.success
              ? broadcastsRes.value.data.length
              : null,
          templateCount:
            templatesRes.status === 'fulfilled' && templatesRes.value.success
              ? templatesRes.value.data.length
              : null,
          automationCount:
            automationsRes.status === 'fulfilled' && automationsRes.value.success
              ? automationsRes.value.data.filter((a) => a.isActive).length
              : null,
          scoringRuleCount:
            scoringRes.status === 'fulfilled' && scoringRes.value.success
              ? scoringRes.value.data.length
              : null,
        });
      } catch {
        setError('データの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [selectedAccountId]);

  const accountLabel = selectedAccount
    ? `${selectedAccount.displayName || selectedAccount.name} の管理画面`
    : '友だち・配信・シナリオをひとつの画面から管理';

  return (
    <div className="relative isolate -mx-4 -mt-[72px] -mb-6 min-h-screen px-0 pb-0 pt-[72px] sm:-mx-6 lg:-mx-8 lg:-mt-8 lg:-mb-8 lg:pt-8">
      <div className="lh-dref max-w-none px-4 sm:px-6 lg:px-8">
        <header className="topbar">
          <div />
          <label className="search">
            <span>検索</span>
            <input
              type="search"
              placeholder="検索（友だち・シナリオ・テンプレートなど）"
              readOnly
            />
          </label>
          <div className="topbar-right">
            <button className="icon-button" type="button" aria-label="通知">
              <span className="badge-count">3</span>🔔
            </button>
            <div className="user-chip">
              <span className="avatar" />
              運営 太郎
              <span>⌄</span>
            </div>
          </div>
        </header>

        {error && (
          <Alert variant="error" className="mb-3">
            {error}
          </Alert>
        )}

        <section className="hero card">
          <div className="hero-bg" aria-hidden="true">
            <img className="hero-bg-blob" src={`${DE}/02_green_blob.png`} alt="" />
            <img className="hero-bg-cloud" src={`${DE}/04_purple_cloud.png`} alt="" />
            <img className="hero-bg-peach" src={`${DE}/03_peach_wave_area.png`} alt="" />
            <img className="hero-bg-circle" src={`${DE}/01_blue_circle.png`} alt="" />
          </div>
          <div className="hero-main">
            <p className="eyebrow">LINE公式アカウント CRM</p>
            <h1>ダッシュボード</h1>
            <p>{accountLabel}</p>
          </div>
          <div className="hero-actions">
            <a
              className="button primary"
              href={`${getApiBaseUrl()}/auth/line?ref=dashboard`}
              target="_blank"
              rel="noopener noreferrer"
            >
              LINEで体験する ↗
            </a>
            <SafeLink href="/login" className="button ghost">
              ログイン
            </SafeLink>
          </div>
          <div className="hero-art" aria-hidden="true">
            <img className="hero-chart" src={`${DE}/05_blue_line_area.png`} alt="" />
            <img className="hero-donut" src={`${DE}/06_blue_donut.png`} alt="" />
            <img className="hero-bars" src={`${DE}/57_blue_bar_chart.png`} alt="" />
            <img className="hero-branch" src={`${DE}/18_green_branch.png`} alt="" />
            <img className="hero-scribble" src={`${DE}/25_blue_scribble.png`} alt="" />
          </div>
        </section>

        <section className="trial card">
          <div className="trial-copy">
            <span className="round-icon line">＋</span>
            <div>
              <h2>LINE で体験する</h2>
              <p>友だち追加でステップ配信・フォーム・自動返信を体験</p>
            </div>
          </div>
          <a
            className="button line-button"
            href={`${getApiBaseUrl()}/auth/line?ref=dashboard`}
            target="_blank"
            rel="noopener noreferrer"
          >
            友だち追加
          </a>
        </section>

        <section className="metric-grid" aria-label="主要指標">
          <SafeLink href="/friends" className="metric card">
            <span className="metric-icon blue">👥</span>
            <p>友だち数</p>
            <strong>{loading ? '…' : formatStat(stats.friendCount)}</strong>
            <small aria-hidden="true">&nbsp;</small>
            <img className="metric-sparkline" src={`${DE}/47_blue_area_chart.png`} alt="" />
          </SafeLink>
          <SafeLink href="/scenarios" className="metric card">
            <span className="metric-icon green">♟</span>
            <p>アクティブシナリオ数</p>
            <strong>{loading ? '…' : formatStat(stats.activeScenarioCount)}</strong>
            <small aria-hidden="true">&nbsp;</small>
            <img className="metric-sparkline" src={`${DE}/49_blue_wave_line.png`} alt="" />
          </SafeLink>
          <SafeLink href="/broadcasts" className="metric card">
            <span className="metric-icon orange">➤</span>
            <p>配信数（合計）</p>
            <strong>{loading ? '…' : formatStat(stats.broadcastCount)}</strong>
            <small aria-hidden="true">&nbsp;</small>
            <img className="metric-sparkline" src={`${DE}/55_orange_line_chart.png`} alt="" />
          </SafeLink>
          <SafeLink href="/templates" className="metric card">
            <span className="metric-icon purple">▤</span>
            <p>テンプレート数</p>
            <strong>{loading ? '…' : formatStat(stats.templateCount)}</strong>
            <small aria-hidden="true">&nbsp;</small>
            <img className="metric-sparkline" src={`${DE}/56_purple_line_chart.png`} alt="" />
          </SafeLink>
          <SafeLink href="/automations" className="metric card">
            <span className="metric-icon teal">🛡</span>
            <p>アクティブルール数</p>
            <strong>{loading ? '…' : formatStat(stats.automationCount)}</strong>
            <small aria-hidden="true">&nbsp;</small>
            <img className="metric-sparkline" src={`${DE}/50_green_wave_line.png`} alt="" />
          </SafeLink>
          <SafeLink href="/scoring" className="metric card">
            <span className="metric-icon yellow">★</span>
            <p>スコアリングルール数</p>
            <strong>{loading ? '…' : formatStat(stats.scoringRuleCount)}</strong>
            <small aria-hidden="true">&nbsp;</small>
            <img className="metric-sparkline" src={`${DE}/52_purple_dashed_wave.png`} alt="" />
          </SafeLink>
        </section>

        <div className="dashboard-rows">
          <div className="dashboard-row dashboard-row-top">
            <section className="card section-card quick-section">
              <div className="section-heading">
                <h2>クイックアクション</h2>
              </div>
              <div className="quick-grid">
                <SafeLink href="/friends">
                  <span className="metric-icon blue">👥</span>
                  <strong>友だち管理</strong>
                  <small>友だちの一覧・タグ管理</small>
                  <b>→</b>
                </SafeLink>
                <SafeLink href="/scenarios">
                  <span className="metric-icon green">♟</span>
                  <strong>シナリオ配信</strong>
                  <small>シナリオの作成・編集</small>
                  <b>→</b>
                </SafeLink>
                <SafeLink href="/broadcasts">
                  <span className="metric-icon orange">➤</span>
                  <strong>一斉配信</strong>
                  <small>メッセージの一括送信</small>
                  <b>→</b>
                </SafeLink>
                <SafeLink href="/chats">
                  <span className="metric-icon purple">●</span>
                  <strong>チャット</strong>
                  <small>個別トークとサポート</small>
                  <b>→</b>
                </SafeLink>
                <SafeLink href="/health">
                  <span className="metric-icon red">!</span>
                  <strong>BAN検知</strong>
                  <small>アカウント健全性チェック</small>
                  <b>→</b>
                </SafeLink>
              </div>
              <div className="mt-4 flex justify-end">
                <CcPromptButton prompts={ccPrompts} dock="inline-end" />
              </div>
            </section>

            <section className="card activity-card activity-section">
              <div className="section-heading">
                <h2>最近のアクティビティ</h2>
                <SafeLink href="/inbox">すべて見る</SafeLink>
              </div>
              <ol className="activity-list">
                <li>
                  <time>10:42</time>
                  <span className="dot green" />
                  シナリオ「相談案内フロー」を公開しました
                </li>
                <li>
                  <time>10:31</time>
                  <span className="dot orange" />
                  一斉配信「お知らせ」を配信しました
                </li>
                <li>
                  <time>09:48</time>
                  <span className="dot purple" />
                  フォーム「初回問診」を更新しました
                </li>
                <li>
                  <time>09:15</time>
                  <span className="dot blue" />
                  友だちが追加されました
                </li>
                <li>
                  <time>08:55</time>
                  <span className="dot teal" />
                  Webhook通知の正常受信を確認しました
                </li>
              </ol>
            </section>

            <aside className="phone-panel card phone-section">
              <div className="section-heading">
                <h2>LIFF/ミニアプリ プレビュー</h2>
              </div>
              <div className="phone">
                <div className="phone-speaker" />
                <div className="phone-top">
                  <span>
                    ‹ {selectedAccount?.displayName || selectedAccount?.name || '公式アカウント'}
                  </span>
                  <span>☰</span>
                </div>
                <div className="phone-body">
                  <h3>
                    友だち追加して
                    <br />
                    始める
                  </h3>
                  <ol>
                    <li className="done">
                      <span>✓</span>友だち追加
                    </li>
                    <li className="current">
                      <span>2</span>登録情報の入力
                    </li>
                    <li>
                      <span>3</span>登録完了
                    </li>
                  </ol>
                  <a
                    className="button primary phone-cta"
                    href={`${getApiBaseUrl()}/auth/line?ref=dashboard`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    次へ進む
                  </a>
                </div>
              </div>
            </aside>
          </div>

          <div className="dashboard-row dashboard-row-bottom">
            <section className="card section-card health-section">
              <div className="section-heading">
                <h2>運用の安心</h2>
                <SafeLink href="/health">すべて正常</SafeLink>
              </div>
              <div className="health-grid">
                <article>
                  <span>☑</span>
                  <strong>複数公式アカウント</strong>
                  <small className="ok">正常</small>
                </article>
                <article>
                  <span>◇</span>
                  <strong>権限管理</strong>
                  <small className="ok">正常</small>
                </article>
                <article>
                  <span>♧</span>
                  <strong>Webhook</strong>
                  <small className="ok">正常</small>
                </article>
                <article>
                  <span>⬡</span>
                  <strong>BAN検知</strong>
                  <small className="warn">注意</small>
                </article>
                <article>
                  <span>☼</span>
                  <strong>緊急コントロール</strong>
                  <small className="ok">正常</small>
                </article>
              </div>
            </section>

            <section className="card chart-card chart-section">
              <div className="section-heading">
                <h2>友だち数の推移</h2>
                <span>7日間</span>
              </div>
              <img
                className="chart-image"
                src={`${DE}/47_blue_area_chart.png`}
                alt="友だち数の推移グラフ（装飾）"
              />
            </section>

            <div className="dashboard-col-spacer" aria-hidden="true" />
          </div>
        </div>

        <section className="security card">
          <div>
            <span className="metric-icon blue">🛡</span>
            <strong>安心してご利用いただくために</strong>
            <p>
              らチェクアカウントの健全性とセキュリティを継続的に検知されています。定期的なBAN検知と緊急コントロールで、安全・安心な運用をサポートします。
            </p>
          </div>
          <SafeLink href="/accounts">セキュリティ設定を確認する ↗</SafeLink>
        </section>
      </div>
    </div>
  );
}
