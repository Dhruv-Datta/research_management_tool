import { supabase } from './supabase';

const DEFAULT_WATCHLIST = {
  watchlists: [
    { id: 'default', name: 'My Watchlist', stocks: [] }
  ],
  activeWatchlistId: 'default',
};

export async function loadWatchlist() {
  const [{ data: watchlists, error: wErr }, { data: setting, error: sErr }] = await Promise.all([
    supabase.from('watchlists').select('*'),
    supabase.from('app_settings').select('value').eq('key', 'activeWatchlistId').single(),
  ]);

  if (wErr || !watchlists || watchlists.length === 0) {
    return { ...DEFAULT_WATCHLIST, watchlists: [{ ...DEFAULT_WATCHLIST.watchlists[0] }] };
  }

  return {
    watchlists: watchlists.map(w => ({
      id: w.id,
      name: w.name,
      stocks: w.stocks || [],
    })),
    activeWatchlistId: setting?.value || 'default',
  };
}

export async function saveWatchlist(data) {
  const { watchlists, activeWatchlistId } = data;

  // Get existing watchlist IDs
  const { data: existing } = await supabase.from('watchlists').select('id');
  const existingIds = new Set((existing || []).map(w => w.id));
  const newIds = new Set(watchlists.map(w => w.id));

  // Delete removed watchlists
  const toDelete = [...existingIds].filter(id => !newIds.has(id));
  if (toDelete.length > 0) {
    await supabase.from('watchlists').delete().in('id', toDelete);
  }

  // Upsert all watchlists
  if (watchlists.length > 0) {
    const { error } = await supabase.from('watchlists').upsert(
      watchlists.map(w => ({
        id: w.id,
        name: w.name,
        stocks: w.stocks || [],
      }))
    );
    if (error) throw new Error(error.message);
  }

  // Upsert activeWatchlistId
  await supabase.from('app_settings').upsert({
    key: 'activeWatchlistId',
    value: activeWatchlistId || 'default',
  });
}
