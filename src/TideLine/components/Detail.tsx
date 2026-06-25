import { useState } from 'react';
import StampFrame from './StampFrame';
import AuthorChip from './AuthorChip';
import CreaturePortrait from './CreaturePortrait';
import { IconArrowLeft, IconTrash, IconSend } from './icons';
import { fallbackCreatures } from '../data/habitats';
import type { CoastShore, CreatureKind } from '../types';
import type { GuestMessage } from '@shared/social/guestbook';
import { timeAgo } from '@shared/social/guestbook';
import { t, getLang } from '../i18n';

interface Props {
  cs: CoastShore;
  myUserId: string | null;
  notes: GuestMessage[];
  onBack: () => void;
  onSendNote: (text: string) => void;
}

export default function Detail({ cs, myUserId, notes, onBack, onSendNote }: Props) {
  const [text, setText] = useState('');
  const isSelf = cs.authorId === myUserId;
  const lang = getLang();

  // wildlife that returned to this shore (what the author rescued), deduped to
  // unique species with a count so each gets one premium close-up portrait
  const returnedRaw = cs.shore.rescued && cs.shore.rescued.length
    ? cs.shore.rescued
    : fallbackCreatures(cs.shore.habitat, cs.shore.seed);
  const counts = new Map<CreatureKind, number>();
  for (const k of returnedRaw) counts.set(k, (counts.get(k) || 0) + 1);
  const returned = [...counts.entries()];

  const send = () => {
    const v = text.trim();
    if (!v) return;
    onSendNote(v);
    setText('');
  };

  return (
    <div className="tl-detail">
      <div className="tl-detail__scroll">
        <button className="tl-detail__back" onClick={onBack}>
          <IconArrowLeft size={16} /> {t('back')}
        </button>

        <div className="tl-detail__hero">
          <StampFrame cs={cs} animated />
        </div>

        <div className="tl-detail__head">
          <span className="tl-detail__by">{t('restoredBy')}</span>
          <AuthorChip
            userId={cs.authorId}
            name={cs.authorName}
            avatar={cs.authorAvatar}
            isSelf={isSelf}
            size={28}
          />
          <span className="tl-detail__litter">
            <IconTrash size={14} /> {t('piecesCleared', { n: cs.shore.litter })}
          </span>
        </div>

        {/* wildlife that returned — premium close-up portrait gallery */}
        {returned.length > 0 && (
          <div className="tl-section">
            <div className="tl-section__title">{t('wildlifeReturned')}</div>
            <div className="tl-folio">
              {returned.map(([k, n]) => (
                <CreaturePortrait key={k} kind={k} count={n} />
              ))}
            </div>
          </div>
        )}

        {/* notes */}
        <div className="tl-section">
          <div className="tl-section__title">
            {t('notesN')}
            {notes.length > 0 && <span className="tl-detail__badge">{notes.length}</span>}
          </div>
          <div className="tl-notes">
            {notes.length === 0 && <div className="tl-notes__empty">{t('noNotes')}</div>}
            {notes.map(m => (
              <div key={m.id} className="tl-note">
                <AuthorChip
                  userId={m.fromUserId || ''}
                  name={m.userName}
                  avatar={m.userAvatarUrl}
                  isSelf={m.fromUserId === myUserId}
                  size={22}
                />
                <div className="tl-note__body">
                  <span className="tl-note__text">{m.text}</span>
                  <span className="tl-note__time">{timeAgo(m.ts, lang)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="tl-detail__spacer" />
      </div>

      {/* compose bar */}
      <div className="tl-compose tl-compose--bar">
        <input
          className="tl-compose__input"
          value={text}
          maxLength={140}
          placeholder={t('notePlaceholder')}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
        />
        <button
          className="tl-compose__send"
          onPointerDown={send}
          disabled={!text.trim()}
          aria-label={t('send')}
        >
          <IconSend size={17} />
        </button>
      </div>
    </div>
  );
}
