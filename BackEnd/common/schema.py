"""Keep compatibility slash aliases out of the canonical API documentation."""


def canonical_endpoints(endpoints):
    canonical = {(path, method) for path, _, method, _ in endpoints}
    return [entry for entry in endpoints
            if not (entry[0].endswith("/") and (entry[0][:-1], entry[2]) in canonical)]
