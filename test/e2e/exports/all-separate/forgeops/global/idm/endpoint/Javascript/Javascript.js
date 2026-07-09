  (function () {
    if (request.method === 'create') {
      // POST
      return {};
    } else if (request.method === 'read') {
      // GET
      return {};
    } else if (request.method === 'update') {
      // PUT
      return {};
    } else if (request.method === 'patch') {
      return {};
    } else if (request.method === 'delete') {
      return {};
    }
    throw { code: 500, message: 'Unknown error' };
  }());
