#!/bin/sh
# Pass the target backend container explicitly; never infer a deployment.
set -eu
backend_container="${1:?Usage: reconcile-contracts.sh BACKEND_CONTAINER}"
docker exec "$backend_container" python manage.py expire_unsigned_contracts
docker exec "$backend_container" python manage.py reconcile_payments
