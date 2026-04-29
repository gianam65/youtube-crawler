interface Props {
  active: 'queue';
}

export function Sidebar({ active }: Props): JSX.Element {
  const items: { key: 'queue'; label: string; icon: string }[] = [
    { key: 'queue', label: 'Queue', icon: '📥' },
  ];

  return (
    <aside className="w-44 shrink-0 border-r border-gray-200 bg-gray-50 pt-12">
      <nav className="px-2 space-y-1">
        {items.map((item) => (
          <div
            key={item.key}
            className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
              active === item.key
                ? 'bg-gray-200 text-gray-900'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>
    </aside>
  );
}
