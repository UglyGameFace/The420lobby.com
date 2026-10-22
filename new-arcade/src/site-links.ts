/** Canonical browser links for the main site and the standalone arcade hostname. */
export function siteLinks(origin = window.location.origin) {
  const arcade = origin === "https://arcade.the420lobby.com";
  const home = arcade ? "https://the420lobby.com/" : "/";
  return {
    home,
    vibe: home + "#vibe",
    experiences: home + "#experiences",
    afterDark: home + "#after-dark",
    arcade: arcade ? "/#games" : "/arcade.html#games",
    top: arcade ? "/#top" : "/arcade.html#top"
  };
}
