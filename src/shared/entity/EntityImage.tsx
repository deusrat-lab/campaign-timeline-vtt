/** Neutral portrait/thumbnail with an initials fallback. Campaign-agnostic. */
export function EntityImage({ src, name, size = 44, rounded = true }: { src?: string; name: string; size?: number; rounded?: boolean }) {
  const initials = name.trim().slice(0, 2).toUpperCase();
  const style: React.CSSProperties = { width: size, height: size, borderRadius: rounded ? 8 : 4, flex: '0 0 auto', objectFit: 'cover', border: '1px solid var(--border-soft, #333)' };
  if (src) return <img className="shared-entity-img" src={src} alt={name} loading="lazy" style={style} />;
  return (
    <div className="shared-entity-img-fallback" style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card, #1a1712)', color: 'var(--gold-soft, #d8b25a)', fontWeight: 700, fontSize: size * 0.32 }}>
      {initials || '—'}
    </div>
  );
}
