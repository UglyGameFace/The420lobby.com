import './indie-spotlight.css';

// Use the exact two WebP files from the owner's indie-fighter-splash-links.zip.
// These source bytes must not be replaced by generated art or creator hotlinks.
const fighters = [
  {
    title: 'Boondock Brawlers',
    url: 'https://boondocksbrawl.com/',
    image: '/assets/boondocks-brawl-user-zip-20261022.webp',
    width: 1100,
    height: 619,
    subtitle: 'Free indie browser fighter',
    className: '',
  },
  {
    title: 'Friday Fighters',
    url: 'https://fridayfighters.com/',
    image: '/assets/friday-fighters-user-zip-20261022.webp',
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
        <p className="indie-spotlight__intro">Two indie fighting games. Tap the original splash images to play on their creators' sites.</p>
      </div>
      <div className="indie-spotlight__grid">
        {fighters.map(game => (
          <a className={`indie-spotlight__card ${game.className}`}
             href={game.url} target="_blank" rel="noopener noreferrer"
             aria-label={`Play ${game.title} on the creator's website (opens in new tab)`}
             key={game.url}>
            <img className="indie-spotlight__image"
                 src={game.image} width={game.width} height={game.height}
                 alt={`Original ${game.title} promotional splash from the owner's Indie Fighters ZIP`}
                 loading="lazy" decoding="async" />
            <span className="indie-spotlight__meta">
              <span className="indie-spotlight__meta-title">{game.title}</span>
              <span className="indie-spotlight__meta-hint">{game.subtitle} ↗</span>
            </span>
          </a>
        ))}
      </div>
      <p className="indie-spotlight__note">
        Promotional artwork supplied for The 420 Lobby Arcade, not official game art.
        These external games have separate accounts and do not share our Discord scores or leaderboards.
      </p>
    </section>
  );
}
