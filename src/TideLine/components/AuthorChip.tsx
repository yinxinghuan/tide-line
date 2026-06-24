import { isInAigram, openAigramProfile } from '@shared/runtime';
import { t } from '../i18n';

interface Props {
  userId: string;
  name?: string;
  avatar?: string;
  isSelf: boolean;
  size?: number;
}

/** Avatar + name pair. Tappable → opens the user's Aigram profile. Self shows
 *  'You' in accent color (no profile button). */
export default function AuthorChip({ userId, name, avatar, isSelf, size = 26 }: Props) {
  if (isSelf) {
    return <span className="tl-chip tl-chip--self">{t('you')}</span>;
  }
  const label = name || '·';
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <button
      className="tl-chip"
      disabled={!isInAigram}
      onClick={ev => {
        ev.stopPropagation();
        if (userId) openAigramProfile(userId);
      }}
    >
      {avatar ? (
        <img
          className="tl-chip__av"
          src={avatar}
          alt=""
          draggable={false}
          style={{ width: size, height: size }}
        />
      ) : (
        <span className="tl-chip__av tl-chip__av--ph" style={{ width: size, height: size }}>
          {initial}
        </span>
      )}
      <span className="tl-chip__name">{label}</span>
    </button>
  );
}
