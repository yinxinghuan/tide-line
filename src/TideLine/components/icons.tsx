// Crisp line-icon set (lucide-flavored). 24×24 viewBox, currentColor, round
// caps/joins. No emoji anywhere in the UI.

interface P {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function svg(children: React.ReactNode, { size = 24, className, strokeWidth = 2 }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconSoundOn = (p: P) =>
  svg(
    <>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </>,
    p,
  );

export const IconSoundOff = (p: P) =>
  svg(
    <>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="m22 9-6 6" />
      <path d="m16 9 6 6" />
    </>,
    p,
  );

export const IconSparkle = (p: P) =>
  svg(
    <>
      <path d="M12 3v0c.4 3.5 2.5 5.6 6 6-3.5.4-5.6 2.5-6 6-.4-3.5-2.5-5.6-6-6 3.5-.4 5.6-2.5 6-6Z" />
      <path d="M19 14c.2 1.5 1 2.3 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.2 2.3-1 2.5-2.5Z" />
    </>,
    p,
  );

export const IconTrophy = (p: P) =>
  svg(
    <>
      <path d="M6 4h12v3a6 6 0 0 1-12 0V4Z" />
      <path d="M6 6H4a2 2 0 0 0 2 4" />
      <path d="M18 6h2a2 2 0 0 1-2 4" />
      <path d="M12 13v4" />
      <path d="M9 21h6" />
      <path d="M10 17h4l1 4H9l1-4Z" />
    </>,
    p,
  );

export const IconTrash = (p: P) =>
  svg(
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>,
    p,
  );

export const IconWave = (p: P) =>
  svg(
    <>
      <path d="M2 8c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 2 2" />
      <path d="M2 14c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 2 2" />
    </>,
    p,
  );

export const IconArrowRight = (p: P) =>
  svg(
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>,
    p,
  );

export const IconArrowLeft = (p: P) =>
  svg(
    <>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </>,
    p,
  );

export const IconSend = (p: P) =>
  svg(
    <>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </>,
    p,
  );

export const IconHand = (p: P) =>
  svg(
    <>
      <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.6a4 4 0 0 1-3-1.4l-3.1-3.6a1.6 1.6 0 0 1 2.4-2.1L9 14.5V7.5a1.5 1.5 0 0 1 3 0" />
    </>,
    p,
  );
