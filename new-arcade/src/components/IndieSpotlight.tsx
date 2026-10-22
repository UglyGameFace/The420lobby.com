import './indie-spotlight.css';

const fighters = [
  {
    title: 'Boondocks Brawl',
    url: 'https://boondocksbrawl.com/',
    subtitle: 'Huey and Riley lead a 32-fighter Woodcrest roster',
    className: '',
    portraits: [
      {name: 'Huey', src: 'https://boondocksbrawl.com/portraits/huey.webp'},
      {name: 'Riley', src: 'https://boondocksbrawl.com/portraits/riley.webp'},
    ],
  },
  {
    title: 'Friday Fighters',
    url: 'https://fridayfighters.com/',
    subtitle: 'Play as Craig, Smokey and other Friday favorites',
    className: 'indie-spotlight__card--friday',
    portraits: [
      {name: 'Craig', src: 'https://fridayfighters.com/portraits/craig.webp'},
      {name: 'Smokey', src: 'https://fridayfighters.com/portraits/smokey.webp'},
    ],
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
        <p className="indie-spotlight__intro">Real fighters from the games' published rosters, not AI-invented stand-ins. Tap to play on the creator's website.</p>
      </div>
      <div className="indie-spotlight__grid">
        {fighters.map(game => (
          <a className={`indie-spotlight__card ${game.className}`} href={game.url}
             target="_blank" rel="noopener noreferrer"
             aria-label={`Play ${game.title} on the creator's website (opens in new tab)`}
             key={game.url}>
            <div className="indie-spotlight__portrait-grid">
              {game.portraits.map(person => (
                <figure className="indie-spotlight__fighter" key={person.name}>
                  <img className="indie-spotlight__portrait" src={person.src}
                       alt={`${person.name} character portrait from ${game.title}`}
                       loading="lazy" decoding="async" width={640} height={640}
                       referrerPolicy="no-referrer" />
                  <figcaption className="indie-spotlight__fighter-name">{person.name}</figcaption>
                </figure>
              ))}
            </div>
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
      <p className="indie-spotlight__note">Unofficial fan games from LMG. Character portraits are displayed from the games' own websites, not recreated or endorsed by The 420 Lobby. The external games do not share our Discord scores.</p>
    </section>
  );
}
