function applyDiff(currentApps, previousApps) {
  const previousBySlug = new Map((previousApps || []).map((app) => [app.slug, app]));

  return currentApps.map((app) => {
    const prev = previousBySlug.get(app.slug);
    const prevRank = prev?.rank7d;
    const currentRank = app.rank7d;

    let deltaRank7d = 0;
    if (typeof prevRank === 'number' && typeof currentRank === 'number') {
      deltaRank7d = currentRank - prevRank;
    }

    const isNewApp = !prev;
    const wasOutsideTop100 = !prev || (typeof prev.rank7d === 'number' && prev.rank7d > 100);
    const nowInTop100 = typeof currentRank === 'number' && currentRank <= 100;
    const enteredTop20 = (!prev || prev.rank7d > 20) && currentRank <= 20;

    const isHot = deltaRank7d <= -10 || enteredTop20;
    const isDrop = deltaRank7d >= 10;
    const isNew = isNewApp || (wasOutsideTop100 && nowInTop100);

    return {
      ...app,
      deltaRank7d,
      flags: {
        hot: Boolean(isHot),
        new: Boolean(isNew),
        drop: Boolean(isDrop)
      }
    };
  });
}

module.exports = {
  applyDiff
};
