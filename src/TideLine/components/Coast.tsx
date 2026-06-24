import { useState } from 'react';
import StampFrame from './StampFrame';
import AuthorChip from './AuthorChip';
import CreatureIcon from './CreatureIcon';
import BottomSheet from './BottomSheet';
import { IconTrophy, IconTrash, IconSparkle } from './icons';
import { MILESTONES, nextMilestone, unlockedRares } from '../data/biomes';
import type { Beachcomber, CoastShore, CoastStats } from '../types';
import { t } from '../i18n';
import { isInAigram, openAigramProfile } from '@shared/runtime';

interface Props {
  shores: CoastShore[];
  stats: CoastStats;
  leaderboard: Beachcomber[];
  myUserId: string | null;
  loaded: boolean;
  onClean: () => void;
  onOpen: (s: CoastShore) => void;
}

export default function Coast({
  shores,
  stats,
  leaderboard,
  myUserId,
  loaded,
  onClean,
  onOpen,
}: Props) {
  const [showBoard, setShowBoard] = useState(false);

  return (
    <div className="tl-coast">
      <div className="tl-coast__scroll">
        {/* hero / collective counter */}
        <div className="tl-coast__hero">
          <div className="tl-coast__brand">{t('coastTitle')}</div>
          <div className="tl-coast__together">{t('together')}</div>
          <div className="tl-coast__big">{stats.totalLitter.toLocaleString()}</div>
          <div className="tl-coast__unit">{t('collectiveLitter')}</div>
          <div className="tl-coast__meta">
            <span>
              {stats.beachcombers === 1
                ? t('beachcomber1')
                : t('beachcombers', { n: stats.beachcombers })}
            </span>
            <span className="tl-coast__dot">·</span>
            <span>
              {stats.stretches === 1 ? t('stretch1') : t('stretches', { n: stats.stretches })}
            </span>
          </div>

          {/* leaderboard tucked behind a pill — keeps the wall focused on shores */}
          {leaderboard.length > 0 && (
            <button className="tl-board-pill" onClick={() => setShowBoard(true)}>
              <IconTrophy size={15} />
              {t('leaderboard')}
            </button>
          )}
        </div>

        {/* community milestones — only together can rare sea life return */}
        {(() => {
          const next = nextMilestone(stats.totalLitter);
          const unlocked = unlockedRares(stats.totalLitter);
          const prev = MILESTONES.filter(m => stats.totalLitter >= m.litter).pop();
          if (!next) {
            return (
              <div className="tl-goal tl-goal--done">
                <div className="tl-goal__icon"><CreatureIcon kind="whale" size={34} /></div>
                <div className="tl-goal__body">
                  <div className="tl-goal__title">{t('allBack')}</div>
                  <div className="tl-goal__chips">
                    {MILESTONES.map(m => <CreatureIcon key={m.species} kind={m.species} size={26} />)}
                  </div>
                </div>
              </div>
            );
          }
          const from = prev ? prev.litter : 0;
          const pct = Math.min(1, Math.max(0, (stats.totalLitter - from) / (next.litter - from)));
          const left = Math.max(0, next.litter - stats.totalLitter);
          return (
            <div className="tl-goal">
              <div className="tl-goal__icon"><CreatureIcon kind={next.species} size={34} /></div>
              <div className="tl-goal__body">
                <div className="tl-goal__title">{t('rareGoal', { name: t(next.species) })}</div>
                <div className="tl-goal__track">
                  <div className="tl-goal__fill" style={{ width: `${pct * 100}%` }} />
                </div>
                <div className="tl-goal__sub">
                  {t('toGo', { n: left.toLocaleString() })}
                  {unlocked.length > 0 && <span className="tl-goal__back">{t('alreadyBack', { n: unlocked.length })}</span>}
                </div>
              </div>
            </div>
          );
        })()}

        {/* grid of restored shores */}
        {loaded && shores.length === 0 ? (
          <div className="tl-coast__empty">{t('emptyCoast')}</div>
        ) : (
          <div className="tl-grid">
            {shores.map(cs => {
              const isSelf = cs.authorId === myUserId;
              return (
                <div key={cs.shore.id} className="tl-card" onClick={() => onOpen(cs)}>
                  <div className="tl-card__art">
                    <StampFrame cs={cs} compact />
                    {isSelf && <span className="tl-card__mine">{t('yourShore')}</span>}
                  </div>
                  <div className="tl-card__foot">
                    <AuthorChip
                      userId={cs.authorId}
                      name={cs.authorName}
                      avatar={cs.authorAvatar}
                      isSelf={isSelf}
                      size={22}
                    />
                    <div className="tl-card__stats">
                      <span title="litter cleared">
                        <IconTrash size={13} /> {cs.shore.litter}
                      </span>
                      {cs.releases.length > 0 && (
                        <span title="wildlife released" className="tl-card__cre">
                          <CreatureIcon kind={cs.releases[0].creature} size={18} />
                          {cs.releases.length}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="tl-coast__spacer" />
      </div>

      {/* sticky clean CTA */}
      <div className="tl-coast__cta">
        <button className="tl-btn tl-btn--primary" onPointerDown={onClean}>
          <IconSparkle size={18} />
          {shores.length === 0 ? t('cleanFirst') : t('cleanAnother')}
        </button>
      </div>

      {/* leaderboard sheet */}
      {showBoard && (
        <BottomSheet title={t('topCombers')} onClose={() => setShowBoard(false)}>
          <div className="tl-board">
            {leaderboard.map((b, i) => {
              const isSelf = b.userId === myUserId;
              return (
                <div
                  key={b.userId}
                  className={'tl-board__row' + (isSelf ? ' tl-board__row--me' : '')}
                  onClick={() => {
                    if (!isSelf && isInAigram && b.userId) openAigramProfile(b.userId);
                  }}
                >
                  <span className="tl-board__rank">{i + 1}</span>
                  {b.avatar ? (
                    <img className="tl-board__av" src={b.avatar} alt="" draggable={false} />
                  ) : (
                    <span className="tl-board__av tl-board__av--ph">
                      {(b.name || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="tl-board__name">{isSelf ? t('you') : b.name || '·'}</span>
                  <span className="tl-board__litter">{b.litter.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
