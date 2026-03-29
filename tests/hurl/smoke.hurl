# HTTP smoke tests against a real local Worker (wrangler dev --local).
# Run via: scripts/api-integration.sh (sets {{base}})

GET {{base}}/openapi.json
HTTP 200
[Asserts]
jsonpath "$.openapi" == "3.1.0"
jsonpath "$.info.title" == "LINE OSS CRM API"

GET {{base}}/docs
HTTP 200
[Asserts]
body contains "openapi.json"

GET {{base}}/api/friends
HTTP 401

POST {{base}}/api/auth/login
Content-Type: application/json
{"apiKey":"wrong-key"}
HTTP 401

GET {{base}}/r/hurl-smoke
HTTP 200
[Asserts]
body contains "LINE で体験する"
