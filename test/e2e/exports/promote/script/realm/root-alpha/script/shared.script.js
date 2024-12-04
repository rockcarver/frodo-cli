(function () {
  outcome = 'true';
  var level = nodeState.get('level').asInteger();
  sharedState.put('sharedValue', 'Level ' + level + ': This is a longer string value shared across all nested journeys. It contains an indicator in which level it was last set.');
}());
