import './indie-spotlight.css';

const fighters = [
  {
    title: 'Boondocks Brawl',
    url: 'https://boondocksbrawl.com/',
    image: '/assets/indie/boondocks-brawl.webp',
    subtitle: 'Neighborhood battles, arcade & online fights',
    className: '',
  },
  {
    title: 'Friday Fighters',
    url: 'https://fridayfighters.com/',
    image: '/assets/indie/friday-fighters.webp',
    subtitle: 'Retro Friday-inspired showdowns',
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
        <p className="indie-spotlight__intro">Step outside the arcade for two fan-made fighting games. Tap a poster to launch the creator's game in a new tab.</p>
      </div>
      <div className="indie-spotlight__grid">
        {fighters.map(game => (
          <a className={`indie-spotlight__card ${game.className}`} href={game.url}
             target="_blank" rel="noopener noreferrer"
             aria-label={`Play ${game.title} on the creator's website (opens in new tab)`}
             key={game.url}>
            <img className="indie-spotlight__image" src={game.image}
                 alt="" loading="lazy" decoding="async" width={1100} height={620} />
            <div className="indie-spotlight__top">
              <span className="indie-spotlight__badge">FREE BROWSER FIGHTER</span>
              <span className="indie-spotlight__external">EXTERNAL GAME ↗</span>
            </div>
            <div className="indie-spotlight__bottom">
              <div>
                <strong className="indie-spotlight__name">{game.title}</strong>
                <span className="indie-spotlight__description">{game.subtitle}</span>
              </div>
              <span className="indie-spotlight__play">PLAY FREE ↗</span>
            </div>
          </a>
        ))}
      </div>
      <p className="indie-spotlight__note">Unofficial fan games from independent creators. These external games do not use The 420 Lobby Discord scores or leaderboards. Promotional art is original, not official game artwork.</p>
    </section>
  );
}
