  import org.forgerock.json.resource.CreateRequest
  import org.forgerock.json.resource.ReadRequest
  import org.forgerock.json.resource.UpdateRequest
  import org.forgerock.json.resource.PatchRequest
  import org.forgerock.json.resource.DeleteRequest
  import org.forgerock.json.resource.NotSupportedException

  if (request instanceof CreateRequest) {
    // POST
    return []
  } else if (request instanceof ReadRequest) {
    // GET
    return []
  } else if (request instanceof UpdateRequest) {
    // PUT
    return []
  } else if (request instanceof PatchRequest) {
    return []
  } else if (request instanceof DeleteRequest) {
    return []
  } else {
    throw new NotSupportedException(request.getClass().getName());
  }
