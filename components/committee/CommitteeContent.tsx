const base = "https://firebasestorage.googleapis.com/v0/b/social-badminton.firebasestorage.app/o/committee%2F";

const members = [
  {
    role: "President",
    name: "Kritparin Suwanwatin",
    title: "Senior C# Engineer",
    company: "SYBO Aps",
    photo: "kritparin.webp",
  },
  {
    role: "Vice President",
    name: "Pairoj Grover",
    title: "Solution Architect",
    company: "Novo Nordisk",
    photo: "pairoj.webp",
  },
  {
    role: "Vice President",
    name: "Kaewkarn Kanchanavipu",
    title: null,
    company: null,
    photo: "kaewkarn.webp",
  },
  {
    role: "Treasurer",
    name: "Sadapha Thawornrat",
    title: "Business owner",
    company: "Restaurant Charm",
    photo: "sadapha.webp",
  },
  {
    role: "Treasurer",
    name: "Navrin Khanijou",
    title: "Risk Manager",
    company: "Scandlines",
    photo: "navrin.webp",
  },
  {
    role: "Brand & Marketing",
    name: "Chayatat Inma",
    title: "Senior Architect",
    company: "Bjarke Ingels Group",
    photo: "chayatat.webp",
  },
  {
    role: "Brand & Marketing",
    name: "Sawinee Galaputh",
    title: "Jr. Project Manager",
    company: "Combineering",
    photo: "sawinee.webp",
  },
  {
    role: "Brand & Marketing",
    name: "Narumol Charoencharatkun",
    title: "Business Analyst",
    company: "ROCKWOOL Group",
    photo: "narumol.webp",
  },
  {
    role: "Admin",
    name: "Sasithorn Phetsaen",
    title: "Service employee",
    company: "ISS Facility Services A/S",
    photo: "sasithorn.webp",
  },
  {
    role: "Board member",
    name: "Nithinan Saengthongfungsawang",
    title: "Entrepreneur",
    company: null,
    photo: "nithinan.webp",
  },
];

export function CommitteeContent() {
  return (
    <section>
      <h1 className="text-2xl font-bold">Committee</h1>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {members.map((m) => (
          <div
            key={m.name}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-center"
          >
            {m.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- photos are pre-optimized WebP from Firebase Storage
              <img
                src={base + m.photo + "?alt=media"}
                alt={m.name}
                loading="lazy"
                className="mx-auto size-24 rounded-full object-cover"
              />
            ) : (
              <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-slate-200 text-3xl font-bold text-slate-400">
                {m.name.charAt(0)}
              </div>
            )}
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-teal-700">
              {m.role}
            </p>
            <h2 className="mt-1 break-words font-semibold text-slate-900">{m.name}</h2>
            {m.title && <p className="text-sm text-slate-600">{m.title}</p>}
            {m.company && <p className="text-sm text-slate-500">{m.company}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
