import './indie-spotlight.css';

// These portraits come from the games' published character rosters.
// Do not substitute stock fighters, generated faces, or the old ZIP posters.
const games = [
  {
    title: 'Boondocks Brawl',
    href: 'https://boondocksbrawl.com/',
    tagline: 'WOODCREST SHOWDOWN',
    accent: 'green',
    roster: [
      {name:'Huey', image:'https://boondocksbrawl.com/portraits/huey.webp'},
      {name:'Riley', image:'https://boondocksbrawl.com/portraits/riley.webp'},
      {name:'Granddad', image:'https://boondocksbrawl.com/portraits/granddad.webp'},
    ],
  },
  {
    title: 'Friday Fighters',
    href: 'https://fridayfighters.com/',
    tagline: 'NEIGHBORHOOD SHOWDOWN',
    accent: 'purple',
    roster: [
      {name:'Craig', image:'/assets/friday-roster-craig.webp'},
      {name:'Smokey', image:'/assets/friday-roster-smokey.webp'},
      {name:'Deebo', image:'/assets/friday-roster-deebo.webp'},
    ],
  },
] as const;

export default function IndieSpotlight() {
  return (
    <section className="indie-spotlight" aria-labelledby="indie-spotlight-heading">
      <header className="indie-spotlight__head">
        <div>
          <p className="indie-spotlight__eyebrow">Community picks / free browser games</p>
          <h2 className="indie-spotlight__title" id="indie-spotlight-heading">INDIE FIGHTERS<span>.</span></h2>
        </div>
        <p className="indie-spotlight__intro">Choose your fighter. These are real characters featured by each game's creator.</p>
      </header>
      <div className="indie-spotlight__grid">
        {games.map(game => (
          <a className={`indie-spotlight__card indie-spotlight__card--${game.accent}`}
             key={game.href} href={game.href} target="_blank" rel="noopener noreferrer"
             aria-label={`Play ${game.title} on the creator's website (opens in a new tab)`}>
            <div className="indie-spotlight__topline">
              <span className="indie-spotlight__kicker">REAL GAME ROSTER</span>
              <span className="indie-spotlight__external">FREE TO PLAY ↗</span>
            </div>
            <div className="indie-spotlight__masthead">
              <span className="indie-spotlight__tagline">{game.tagline}</span>
              <h3 className="indie-spotlight__game-name">{game.title}</h3>
            </div>
            <div className="indie-spotlight__roster" aria-label={`Featured ${game.title} characters`}>
              {game.roster.map((fighter, i) => (
                <figure className="indie-spotlight__fighter" key={fighter.name}>
                  <img className="indie-spotlight__fighter-image"
                       src={fighter.image} alt={`${fighter.name} as depicted in ${game.title}`}
                       loading="lazy" decoding="async" width={640} height={640} referrerPolicy="no-referrer" />
                  <figcaption className="indie-spotlight__fighter-name">
                    <span className="indie-spotlight__fighter-number">{String(i+1).padStart(2,'0')}</span>
                    {fighter.name}
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="indie-spotlight__card-footer">
              <span className="indie-spotlight__footer-copy">3 REAL FIGHTERS <span aria-hidden="true">✦</span> MORE IN GAME</span>
              <span className="indie-spotlight__play">PLAY FREE <span aria-hidden="true">↗</span></span>
            </div>
          </a>
        ))}
      </div>
      <p className="indie-spotlight__note">
        Portraits are drawn from public game-roster artwork, served locally for reliable loading. Both games are external fan projects;
        they do not share The 420 Lobby's Discord accounts or arcade rankings.
      </p>
    </section>
  );
}
