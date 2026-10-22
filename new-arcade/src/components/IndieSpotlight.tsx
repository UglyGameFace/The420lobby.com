import './indie-spotlight.css';

// Source of truth: user-uploaded indie-fighter-splash-links.zip.
// These are the byte-exact two WebP files shipped in that archive.
// No creator portraits, alternate generations, stock art, or overlays.
const fighters = [
  {
    title: 'Boondocks Brawl',
    url: 'https://boondocksbrawl.com/',
    image: '/assets/boondocks-brawl.webp',
    width: 1100,
    height: 619,
    subtitle: 'Free indie browser fighter',
    className: '',
  },
  {
    title: 'Friday Fighters',
    url: 'https://fridayfighters.com/',
    image: '/assets/friday-fighters.webp',
    width: 765,
    height: 620,
    subtitle: 'Free indie browser fighter',
    className: 'indie-spotlight__card--friday',
  },
] as const;

export default function IndieSpotlight() {
  return (
    <section className="indie-spotlight" aria-labelledby="indie-spotlight-heading">
      <div className="indie-spotlight__head">
        <div>
          <p className="indie-spotlight__eyebrow">Community picks / free browser games</p>
          <h2 id="indie-spotlight-heading" className="indie-spotlight__title">INDIE FIGHTERS<span>.</span></h2>
        </div>
        <p className="indie-spotlight__intro">Two indie fighting games. Tap the artwork from The 420 Lobby splash-link pack to visit the creators.</p>
      </div>
      <div className="indie-spotlight__grid">
        {fighters.map(game => (
          <a className={`indie-spotlight__card ${game.className}`}
             href={game.url} target="_blank" rel="noopener noreferrer"
             aria-label={`Play ${game.title} on the creator's website (opens in new tab)`}
             key={game.url}>
            <img className="indie-spotlight__image"
                 src={game.image} width={game.width} height={game.height}
                 alt={`${game.title} promotional poster from The 420 Lobby's indie-fighter splash-links pack`}
                 loading="lazy" decoding="async" />
            <span className="indie-spotlight__meta">
              <span className="indie-spotlight__meta-title">{game.title}</span>
              <span className="indie-spotlight__meta-hint">{game.subtitle} ↗</span>
            </span>
          </a>
        ))}
      </div>
      <p className="indie-spotlight__note">
        User-provided promotional splash artwork for The 420 Lobby Arcade, not official game art.
        These external games have separate accounts and do not share our Discord scores or leaderboards.
      </p>
    </section>
  );
}
