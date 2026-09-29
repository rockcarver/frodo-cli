(function () {
  if (scopes.contains('fr:autoaccess:*') || scopes.contains('fr:iga:*') || scopes.contains('fr:idc:analytics:*')) {
    var fr = JavaImporter(
      com.sun.identity.idm.IdType
    );
    var groups = [];
    identity.getMemberships(fr.IdType.GROUP).toArray().forEach(function (group) {
      groups.push(group.getAttribute('cn').toArray()[0]);
    });
    accessToken.setField('groups', groups);
  }
}());
