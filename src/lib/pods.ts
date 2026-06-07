// Curated list of football pods + news. Add new entries here — the Pods tab
// renders them in array order. Keep links to the official destinations; the
// app deep-links out via the user's installed podcast app where possible.

export interface PodLink {
  label: string
  url: string
}

export interface PodEntry {
  id: string
  title: string
  host: string
  blurb: string
  icon: string
  accent: string
  links: PodLink[]
}

export const POD_ENTRIES: PodEntry[] = [
  {
    id: 'rest-is-football',
    title: 'The Rest Is Football',
    host: 'Gary Lineker, Alan Shearer & Micah Richards',
    blurb: 'Three of the most decorated voices in the English game on the biggest stories of the week. Currently #1 on the UK Apple Sports charts.',
    icon: '🎙️',
    accent: '#C8102E',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/2fDn3EgvJZ5J1k5rrBwrlZ' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/the-rest-is-football/id1701022490' },
    ],
  },
  {
    id: 'stick-to-football',
    title: 'Stick to Football',
    host: 'Gary Neville, Roy Keane, Jamie Carragher, Ian Wright & Jill Scott',
    blurb: 'The Overlap\'s flagship round-table. Big names, bigger arguments, and a guest from inside the game most weeks.',
    icon: '🎙️',
    accent: '#0096D6',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/29LjKwNI41bD09xNAMkQes' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/stick-to-football/id1709142395' },
    ],
  },
  {
    id: 'athletic-fc',
    title: 'The Athletic FC Podcast',
    host: 'Ayo Akinwolere with David Ornstein, Phil Hay & Adam Crafton',
    blurb: 'The Athletic\'s flagship football pod — newsbreaking journalism, transfer scoops and tactical deep dives from the best-staffed newsroom in the game.',
    icon: '🎙️',
    accent: '#E11A2B',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/69AAB4ojTuK7gwy3ZdQdB9' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/the-athletic-fc-podcast/id1488521447' },
    ],
  },
  {
    id: 'peter-crouch',
    title: 'That Peter Crouch Podcast',
    host: 'Peter Crouch, Chris Stark & Steve Sidwell',
    blurb: 'The original "what footballers actually talk about" pod. Dressing-room anecdotes, daft chat, the occasional serious take.',
    icon: '🎙️',
    accent: '#EC1C57',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/2NqEBd6EJNfs6A3527xwVD' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/that-peter-crouch-podcast/id1616744464' },
    ],
  },
  {
    id: 'vibe-with-five',
    title: 'Vibe with Five',
    host: 'Rio Ferdinand, Joel Beya & Stephen Howson',
    blurb: 'Rio\'s solo show — weekly Premier League round-ups with big-name guests and unfiltered ex-pro takes.',
    icon: '🎙️',
    accent: '#1A1A1A',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/7isN810N4MvkW72sZQ8ZMP' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/vibe-with-five/id1638148943' },
    ],
  },
  {
    id: 'up-front-simon-jordan',
    title: 'Up Front with Simon Jordan',
    host: 'Simon Jordan',
    blurb: 'Spiky, opinionated and never short of a view. Former Crystal Palace owner sits down with the biggest names in football and beyond.',
    icon: '🎙️',
    accent: '#722F37',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/0nI95xoj1bbfXVIwH8Ci7z' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/up-front/id1683837570' },
    ],
  },
  {
    id: 'football-weekly',
    title: 'Football Weekly',
    host: 'Max Rushden, Barry Glendenning & guests',
    blurb: 'The Guardian\'s long-running pod. Sharp Premier League analysis on Mondays and Thursdays, plus deep dives into the European leagues.',
    icon: '🎙️',
    accent: '#052962',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/6w8qWe0kjgHEHSWDSDGoLW' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/football-weekly/id188674007' },
    ],
  },
  {
    id: 'football-ramble',
    title: 'Football Ramble',
    host: 'Marcus Speller, Luke Moore, Pete Donaldson & Andy Brassell',
    blurb: 'A podcasting institution since 2007. Funny, opinionated and proudly independent — the best in the game on the global football week.',
    icon: '🎙️',
    accent: '#FF6B35',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/5vK22FRxc1VghAYzyemMZP' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/football-ramble/id254078311' },
    ],
  },
  {
    id: 'dressing-room',
    title: 'The Dressing Room',
    host: 'Joe Cole, Carlton Cole & Wayne Bridge',
    blurb: 'Three ex-Chelsea & England lads on the biggest stories of the week, plus dressing-room stories from their playing days.',
    icon: '🎙️',
    accent: '#0057B8',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/5SA1rkxiVWmrv8T9DQDyNv' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/the-dressing-room/id1792177284' },
    ],
  },
]

// Club-specific fan pods, keyed by the same slug used in profiles.favourite_club.
// When a fella has a favourite club set, the Pods tab surfaces these at the
// top before the curated league-wide list. Clubs missing from this map fall
// through to a "no fan pod curated" message — add as we go.
export const CLUB_PODS: Record<string, PodEntry[]> = {
  arsenal: [{
    id: 'arsenal-vision',
    title: 'The ArsenalVision Podcast',
    host: 'Clive Palmer & Tim Stillman',
    blurb: 'Twice-weekly Arsenal pod with thoughtful tactical analysis, post-match reaction and a long history of getting it right when others don\'t.',
    icon: '🔴',
    accent: '#EF0107',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/1yilXNDCKvhWYfBUmgYvqe' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/the-arsenalvision-podcast-arsenal-fc/id946748561' },
    ],
  }],
  aston_villa: [{
    id: 'my-old-man-said',
    title: 'My Old Man Said',
    host: 'Mat Kendrick & guests',
    blurb: 'Multi-award-nominated Aston Villa podcast, part of the talkSPORT fan network. Match reaction, history and big-name guests.',
    icon: '🟣',
    accent: '#670E36',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/6tQjZeN8EIU8wHnrrrSVs2' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/my-old-man-said-an-aston-villa-podcast/id1141719785' },
    ],
  }],
  bournemouth: [{
    id: 'cherries-back-of-the-net',
    title: 'Back of the Net',
    host: 'Sam Davis & Tom Jordan',
    blurb: 'AFC Bournemouth\'s long-running weekly Cherries pod — match analysis, features and interviews every Monday morning.',
    icon: '🍒',
    accent: '#DA291C',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/4cPRnuzukC8snm3q7hHxCv' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/back-of-the-net-the-afc-bournemouth-podcast/id1085537528' },
    ],
  }],
  brentford: [{
    id: 'beesotted',
    title: 'The Beesotted Brentford Podcast',
    host: 'Billy Grant & Dave Lane',
    blurb: '1,200+ episodes of pride-of-West-London chat. Recorded live from the pub more often than not.',
    icon: '🐝',
    accent: '#E30613',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/1Ma27HIVWrg6Ct0F3WixnS' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/the-beesotted-brentford-pride-of-west-london-podcast/id954016339' },
    ],
  }],
  brighton: [{
    id: 'albion-roar',
    title: 'The Albion Roar',
    host: 'Ady Packham & Alan Wares',
    blurb: 'Independent Brighton & Hove Albion radio show going strong since 2007 — broadcast on RadioReverb every Wednesday, podcast straight after.',
    icon: '🐦',
    accent: '#0057B8',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/2a7PvI45rVRdnubhjeZNza' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/the-albion-roar/id340568475' },
    ],
  }],
  chelsea: [{
    id: 'chelsea-fancast',
    title: 'Chelsea FanCast',
    host: 'David Chidgey & guests',
    blurb: 'The longest-running independent Chelsea podcast. By fans, for fans — keep it blue, keep it carefree.',
    icon: '🔵',
    accent: '#034694',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/7v7hmca6FouTfu3W0H10hu' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/chelsea-fancast/id220201865' },
    ],
  }],
  crystal_palace: [{
    id: 'fyp-podcast',
    title: 'FYP Podcast',
    host: 'Jim Daly & guests',
    blurb: 'The original Crystal Palace podcast since 2008. Match reaction, ex-pros, and the occasional outright meltdown.',
    icon: '🦅',
    accent: '#1B458F',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/5QGuFDpOw2fUBrnAhcTZKt' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/fyp-podcast/id373306875' },
    ],
  }],
  everton: [{
    id: 'royal-blue',
    title: 'Royal Blue',
    host: 'Liverpool ECHO Everton team',
    blurb: 'The Everton FC podcast from the Liverpool ECHO — match reaction, transfer talk and behind-the-scenes reporting.',
    icon: '🔷',
    accent: '#003399',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/1hQefBAk9gQ1hU9XU0E1cv' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/royal-blue-the-everton-fc-podcast/id1109062967' },
    ],
  }],
  fulham: [{
    id: 'fulhamish',
    title: 'Fulhamish',
    host: 'Sammy James, Jack Collins & Jack Stevens',
    blurb: 'The voice of Fulham FC fans. Honest and passionate discussion of every Cottagers game — home, away or overseas.',
    icon: '⚫',
    accent: '#000000',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/0W9mpEIrx2ae3z2gDuMFz9' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/fulhamish/id1152978569' },
    ],
  }],
  leeds: [{
    id: 'square-ball',
    title: 'The Square Ball',
    host: 'Moscowhite, Moxcowhite & guests',
    blurb: 'Award-winning show from the team behind the Leeds fanzine. Celebrates the magic and madness of Leeds United.',
    icon: '⚪',
    accent: '#1D428A',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/3tkzCUnvTzA27fXuYLjNHJ' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/the-square-ball-leeds-united-podcast/id349091786' },
    ],
  }],
  liverpool: [{
    id: 'anfield-wrap',
    title: 'The Anfield Wrap',
    host: 'Neil Atkinson & rotating cast',
    blurb: 'Award-winning Liverpool FC podcast. Honest, passionate match reaction and analysis from a deep bench of TAW regulars.',
    icon: '🔴',
    accent: '#C8102E',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/6DBNVs8vrffAejjEYjN3lr' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/the-anfield-wrap/id456906266' },
    ],
  }],
  man_city: [{
    id: 'blue-moon-podcast',
    title: 'Blue Moon Podcast',
    host: 'David Mooney & guests',
    blurb: 'One of the oldest Man City fan pods — running since 2009. New show every Friday morning.',
    icon: '🩵',
    accent: '#6CABDD',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/3nm5sbmhmOxTD1Q0WydCHk' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/blue-moon-podcast-a-manchester-city-show/id327055102' },
    ],
  }],
  man_utd: [{
    id: 'stretford-paddock',
    title: 'Stretford Paddock',
    host: 'Stephen Howson & Adam McKola',
    blurb: 'Unofficial Manchester United supporter channel — match reaction, weekly news round-ups and special guests.',
    icon: '😈',
    accent: '#DA291C',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/3EnMZaazMKvgZ35XRE6p5W' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/manchester-united-podcast-by-stretford-paddock/id1456182249' },
    ],
  }],
  newcastle: [{
    id: 'everything-black-and-white',
    title: 'Everything is Black and White',
    host: 'Andrew Musgrove & guests',
    blurb: 'Six episodes a week of Newcastle United chat — Monday round-ups, Wednesday talk-ins, match previews and verdicts.',
    icon: '⚫',
    accent: '#241F20',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/00NdTcJfl1CvdbZ84RhwE4' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/everything-is-black-and-white-a-newcastle-united-podcast/id913153082' },
    ],
  }],
  nottingham_forest: [{
    id: 'garibaldi-red',
    title: 'Garibaldi Red',
    host: 'Max Hayes & friends',
    blurb: 'A Nottingham Forest podcast — match reaction, opposition previews and Forest legends in conversation.',
    icon: '🔴',
    accent: '#DD0000',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/7wQo22JWpVsl03dG7OooId' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/garibaldi-red-a-nottingham-forest-podcast/id1297296562' },
    ],
  }],
  sunderland: [{
    id: 'roker-rapport',
    title: 'Roker Rapport',
    host: 'Roker Report team',
    blurb: 'Sunderland AFC pod since 2016 — player interviews, previews and reaction from the Roker Report fanzine team.',
    icon: '🔴',
    accent: '#EB172B',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/12BLgJ3prZ4OvDASZOXalq' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/roker-rapport-podcast/id1163779426' },
    ],
  }],
  tottenham: [{
    id: 'spurs-show',
    title: 'The Spurs Show',
    host: 'Mike Leigh & Theo Delaney',
    blurb: 'Lifelong Spurs diehards on the highs and lows of supporting Tottenham. Running for nearly two decades.',
    icon: '⚪',
    accent: '#132257',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/4pKLvBI1YZoKbjEf5W2IdG' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/the-spurs-show/id261350282' },
    ],
  }],
  west_ham: [{
    id: 'kumb',
    title: 'Knees Up Mother Brown',
    host: 'KUMB.com team',
    blurb: 'The KUMB.com West Ham podcast — fan-run, opinionated and packed with West Ham guests from the world of football.',
    icon: '⚒️',
    accent: '#7A263A',
    links: [
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/the-kumb-com-west-ham-podcast/id596433286' },
    ],
  }],
}
