import './indie-spotlight.css';

// These are the user's ORIGINAL October 22 ChatGPT splash images,
// compressed losslessly in layout (WebP, unchanged composition).
// Do not replace them with stock posters, portraits, or creator hotlinks.
const fighters = [
  {
    title: 'Boondock Brawlers',
    url: 'https://boondocksbrawl.com/',
    image: '/assets/boondock-brawlers-original-420-lobby.webp',
    subtitle: 'Free indie browser fighter',
    className: '',
  },
  {
    title: 'Friday Fighters',
    url: 'https://fridayfighters.com/',
    image: '/assets/friday-fighters-original-420-lobby.webp',
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
        <p className="indie-spotlight__intro">Two indie fighting games. Tap the original 420 Lobby splash artwork to visit their creators.</p>
      </div>
      <div className="indie-spotlight__grid">
        {fighters.map(game => (
          <a className={`indie-spotlight__card ${game.className}`}
             href={game.url} target="_blank" rel="noopener noreferrer"
             aria-label={`Play ${game.title} on the creator's website (opens in new tab)`}
             key={game.url}>
            <img className="indie-spotlight__image"
                 src={game.image} width={1672} height={941}
                 alt={`The 420 Lobby's original neon green ${game.title} arcade splash art with Tap to Play graphics`}
                 loading="lazy" decoding="async" />
            <span className="indie-spotlight__meta">
              <span className="indie-spotlight__meta-title">{game.title}</span>
              <span className="indie-spotlight__meta-hint">{game.subtitle} ↗</span>
            </span>
          </a>
        ))}
      </div>
      <p className="indie-spotlight__note">
        Original promotional splash artwork created for The 420 Lobby Arcade, not official game art.
        These external games have separate accounts and do not share our Discord scores or leaderboards.
      </p>
    </section>
  );
}
