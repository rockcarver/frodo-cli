(function () {
  outcome = 'true';
  var level = nodeState.get('level').asInteger();
  sharedState.put('level' + level + 'Value', 'Level ' + level + ': This is a longer string value set at each level of the nested journeys. It contains an indicator in which level it was set.');
}());
