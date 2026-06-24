import { useState } from 'react';
import StampFrame from './StampFrame';
import AuthorChip from './AuthorChip';
import CreatureIcon from './CreatureIcon';
import { IconArrowLeft, IconTrash, IconSend } from './icons';
import { baseCreatures } from '../data/biomes';
import type { CoastShore } from '../types';
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

  // wildlife that returned to this shore (what the author rescued)
  const returned = (cs.shore.rescued && cs.shore.rescued.length
    ? cs.shore.rescued
    : baseCreatures(cs.shore.seed, cs.shore.biome)
  ).slice(0, 10);

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

        {/* wildlife that returned (read-only) */}
        {returned.length > 0 && (
          <div className="tl-section">
            <div className="tl-section__title">{t('wildlifeReturned')}</div>
            <div className="tl-peek tl-peek--static">
              {returned.map((k, i) => (
                <CreatureIcon key={i} kind={k} size={28} />
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
