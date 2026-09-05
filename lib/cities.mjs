/** City adapters keep bounds, modes and line presentation independent of the map. */
export const cities = {
  cologne: {
    id: 'cologne', name: 'Köln', timezone: 'Europe/Berlin',
    center: [50.944, 6.965], bounds: [[50.80, 6.76], [51.10, 7.18]],
    modes: ['TRAM', 'SUBWAY'],
    lines: [
      ['1', '#087ca7'], ['3', '#b43849'], ['4', '#008b9d'], ['5', '#d17b08'],
      ['7', '#c63677'], ['9', '#bd9505'], ['12', '#b1324c'], ['13', '#6b8b20'],
      ['15', '#1c82aa'], ['16', '#ac8805'], ['17', '#8155a6'], ['18', '#427e47'],
    ].map(([id, color]) => ({id, color})),
  },
};
export const city = cities.cologne;
export const MAX_SNAPSHOT_AGE_MS = 120_000;
