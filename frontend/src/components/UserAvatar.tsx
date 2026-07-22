export function UserAvatar({ name, photoUrl, size = 'md' }: { name: string; photoUrl?: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR'))
    .join('') || '?';
  const dimensions = size === 'sm' ? 'h-8 w-8 text-[10px]' : size === 'lg' ? 'h-12 w-12 text-sm' : 'h-10 w-10 text-xs';

  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-sky-100 font-bold text-b24-blue-dark ${dimensions}`} aria-hidden="true">
      {initials}
      {photoUrl && (
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
    </span>
  );
}
