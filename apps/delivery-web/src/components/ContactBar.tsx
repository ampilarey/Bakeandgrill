interface Props {
  name: string | null;
  phone: string | null;
}

function clean(phone: string): string {
  return phone.replace(/\s+/g, '').replace(/^\+/, '');
}

export default function ContactBar({ name, phone }: Props) {
  if (!phone) return null;

  const cleaned = clean(phone);
  const waLink = `https://wa.me/${cleaned}`;

  return (
    <div className="bg-[#EDE4D4] rounded-2xl p-4">
      <p className="text-xs font-medium text-[#8B7355] uppercase tracking-wide mb-3">Customer Contact</p>
      {name && <p className="font-semibold text-[#1C1408] mb-2">{name}</p>}
      <div className="flex gap-3">
        <a
          href={`tel:${phone}`}
          className="flex-1 flex items-center justify-center gap-2 bg-[#1C1408] text-white font-semibold py-3 rounded-xl text-sm active:opacity-80"
        >
          <span>📞</span> Call
        </a>
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] text-white font-semibold py-3 rounded-xl text-sm active:opacity-80"
        >
          <span>💬</span> WhatsApp
        </a>
      </div>
    </div>
  );
}
